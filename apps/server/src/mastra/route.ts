import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import type { ServerResponse } from 'node:http'

import type { MastraDBMessage } from '@mastra/core/agent/message-list'

import { config } from '../config.ts'
import { createLandingPageAgent } from './agents/landing-page-agent.ts'
import { mastra } from './index.ts'
import { visionCost } from './lib/cost.ts'
import { ocrImageInputs, type ImageOcrResult } from './lib/image-ocr.ts'
import { supportsImageInput } from './lib/model-capabilities.ts'
import {
  captureProjectSelectors,
  type CapturedProjectSelector,
} from './lib/project-screenshot.ts'
import {
  appendAgentMessages,
  appendClientMessage,
  appendVisionMessage,
  flushProjectLogs,
  createProjectHtmlStore,
  getProject,
  persistGeneratedImage,
  readAgentRawByTurn,
  setRunStatusSync,
  setTitleIfUntitled,
  updateProjectModel,
  type AgentMessageEntry,
  type ClientMessageEntry,
  type Project,
  type ProjectMessageAttachment,
  type ProjectMessageToolCallPart,
  type ProjectMessageTurn,
  type ProjectRawMessage,
} from './lib/project-store.ts'
import { createLandingAgentErrorProcessors } from './lib/retry.ts'
import {
  broadcast,
  claimRun,
  getRun,
  releaseRun,
  type RunEntry,
} from './lib/run-bus.ts'
import { finalizeRun } from './lib/run-finalize.ts'
import { createRunStatsTracker } from './lib/run-stats.ts'
import { createStreamChunkHandler } from './lib/run-stream-loop.ts'
import {
  compactLines,
  expandScreenshotUrl,
  summarizeToolError,
  type ToolCallDisplay,
} from './lib/tool-display.ts'

const ATTACHMENT_OCR_PROMPT =
  'Analyze the attached image for landing-page generation. Extract all visible text exactly, then describe layout, hierarchy, colors, typography, UI components, imagery, brand cues, and any details the landing-page agent should use. If the image is a screenshot or mockup, call out sections, navigation, CTAs, spacing, and visual style.'
const MAX_STEPS = 30

export type AgentAttachmentInput =
  | AgentElementAttachmentInput
  | AgentImageAttachmentInput

export interface AgentElementAttachmentInput {
  kind: 'element'
  selector: string
}

export interface AgentImageAttachmentInput {
  dataUrl: string
  id: string
  kind?: 'image'
  mediaType: 'image/gif' | 'image/jpeg' | 'image/png' | 'image/webp'
  name: string
  size: number
}

export type StartAgentResult =
  | { ok: false; reason: 'not_found' | 'overlap' }
  | { ok: true; status: 'running'; turnId: string }

type AgentConversationMessage =
  | { content: string; role: 'assistant' }
  | { content: string; role: 'user' }

/**
 * Items fed back to `agent.stream` for history replay. Either a reconstructed
 * `{content, role}` message (user prompt text), a verbatim persisted
 * `MastraDBMessage` carrying the real assistant text, tool calls, and tool
 * results from a prior turn, or a multimodal user message for the current
 * prompt when the chat model accepts image inputs.
 */
type AgentReplayMessage =
  | AgentConversationMessage
  | MastraDBMessage
  | { content: AgentUserContentPart[]; role: 'user' }

/** Multimodal user-message content part (current-prompt attachments). */
type AgentUserContentPart =
  | { image: string; type: 'image' }
  | { text: string; type: 'text' }

interface AttachmentAnalysis {
  contextBlock: string
  cost: number
  imageParts: { dataUrl: string; label: string }[]
  ok: boolean
  visionImages: number
}

interface HtmlUpdatePayload {
  bytes: number
  hash: string
  html: string
  previousHash: string
  projectId: string
  sequence: number
}

type RecordedToolPayload = Omit<ProjectMessageToolCallPart, 'type'>

interface RunBodyOptions {
  attachments: AgentAttachmentInput[]
  baseUrl: string
  controller: AbortController
  entry: RunEntry
  imageModel: string
  project: Project
  projectId: string
  prompt: string
  textModel: string
  turnId: string
  visionModel: string
}

interface StartAgentOptions {
  attachments?: AgentAttachmentInput[]
  baseUrl: string
  imageModel?: string
  projectId: string
  prompt: string
  subscriber?: ServerResponse
  textModel: string
  turnId?: string
  visionModel?: string
}

export function resolveModelId(model?: string): string {
  const requested = model ?? config.openrouter.defaultChatModel
  // Allow a model dropdown to send either the bare id or the openrouter/ prefix.
  return requested.startsWith('openrouter/')
    ? requested.slice('openrouter/'.length)
    : requested
}

/**
 * Start a landing-page agent run for a project and return IMMEDIATELY with the
 * resolved turn id. The run is decoupled from the request: it proceeds in the
 * background, broadcasting events to run-bus subscribers (reopened tabs via
 * `GET /api/projects/:id/events`). The originating `POST /agent` caller gets
 * the JSON ack here and tracks progress via the subscribe endpoint — so closing
 * that tab is delivery loss, not cancellation. Run lifecycle (running/terminal)
 * is persisted to `run-state.json` via `setRunStatusSync`. Returns `not_found`
 * when the project is missing or `overlap` when a run is already active.
 */
export async function startLandingAgent({
  attachments = [],
  baseUrl,
  imageModel = config.openrouter.defaultImageModel,
  projectId,
  prompt,
  subscriber,
  textModel,
  turnId,
  visionModel = config.openrouter.defaultVisionModel,
}: StartAgentOptions): Promise<StartAgentResult> {
  const project = await getProject(projectId)
  if (!project) return { ok: false, reason: 'not_found' }

  const controller = new AbortController()
  const resolvedTurnId = turnId ?? `turn-${randomUUID()}`
  const startedAt = new Date().toISOString()
  const entry: RunEntry = {
    controller,
    startedAt,
    subscribers: subscriber
      ? new Set<ServerResponse>([subscriber])
      : new Set<ServerResponse>(),
    turnId: resolvedTurnId,
  }
  if (!claimRun(projectId, entry)) return { ok: false, reason: 'overlap' }

  setRunStatusSync(projectId, {
    startedAt,
    status: 'running',
    turnId: resolvedTurnId,
  })

  // Detached: the run proceeds independently of the request that started it.
  // `runLandingAgentBody` never rejects (it catches + terminalizes), so `void`
  // is safe — no unhandled rejection.
  void runLandingAgentBody({
    attachments,
    baseUrl,
    controller,
    entry,
    imageModel,
    project,
    projectId,
    prompt,
    textModel,
    turnId: resolvedTurnId,
    visionModel,
  })

  return { ok: true, status: 'running', turnId: resolvedTurnId }
}

/**
 * Gracefully stop the active run for a project: aborts its Mastra stream but
 * leaves subscriber SSE responses open so final cost/stats + `done` are still
 * delivered. Returns whether an active run was found and aborted. The run
 * registry (claim/release/subscribers) lives in `./lib/run-bus.ts`.
 */
export function stopLandingAgent(projectId: string): boolean {
  const entry = getRun(projectId)
  if (!entry) return false
  entry.controller.abort()
  return true
}

async function analyzePromptAttachments({
  attachments,
  baseUrl,
  directImages,
  emit,
  nextToolSeq,
  projectId,
  recordedTurn,
  signal,
  store,
  visionModel,
}: {
  attachments: AgentAttachmentInput[]
  baseUrl: string
  directImages: boolean
  emit: (event: string, payload: unknown) => void
  nextToolSeq: () => number
  projectId: string
  recordedTurn: ProjectMessageTurn
  signal: AbortSignal
  store: ReturnType<typeof createProjectHtmlStore>
  visionModel: string
}): Promise<AttachmentAnalysis> {
  if (attachments.length === 0) {
    return {
      contextBlock: '',
      cost: 0,
      imageParts: [],
      ok: true,
      visionImages: 0,
    }
  }

  const elementSelectors = attachments
    .filter(
      (attachment): attachment is AgentElementAttachmentInput =>
        attachment.kind === 'element',
    )
    .map((attachment) => attachment.selector)
  const imageAttachments = attachments.filter(
    (attachment): attachment is AgentImageAttachmentInput =>
      attachment.kind !== 'element',
  )

  const id = `tool-${nextToolSeq()}-analyze_image`
  const action = 'Analyze attached visual reference'
  const detail = compactLines([
    action,
    ...attachments.map((attachment) =>
      attachment.kind === 'element'
        ? `Element ${attachment.selector}`
        : attachment.name,
    ),
  ])
  const runningPayload: RecordedToolPayload = {
    action,
    detail,
    id,
    state: 'running',
    tool: 'analyze_image',
  }
  emit('tool_call', runningPayload)

  try {
    // Capture selected-element selectors server-side into safe persisted
    // screenshots. One Cloudflare acquisition handles all selectors.
    let elementCaptures: CapturedProjectSelector[] = []
    if (elementSelectors.length > 0) {
      elementCaptures = await captureProjectSelectors({
        html: store.get(),
        projectId,
        selectors: elementSelectors,
        signal,
      })
    }

    // Direct mode: the chat model accepts image inputs, so attached images
    // ride into the run as image parts on the current user message instead of
    // a separate vision-model OCR pass. The model sees the pixels itself.
    if (directImages) {
      const imageParts = [
        ...imageAttachments.map((attachment) => ({
          dataUrl: attachment.dataUrl,
          label: attachment.name,
        })),
        ...elementCaptures.flatMap((capture) =>
          capture.captures.map((viewport) => ({
            dataUrl: viewport.dataUrl,
            label: `Element ${capture.selector} (${viewport.viewport})`,
          })),
        ),
      ]
      // Persist safe screenshot URLs for element captures so the conversation
      // UI can preview them without data URLs.
      const safeImages = elementCaptures.flatMap((capture) =>
        capture.captures.map((viewport) => ({
          alt: `Element ${capture.selector} (${viewport.viewport})`,
          url: expandScreenshotUrl(viewport.imageUrl, baseUrl),
        })),
      )
      const donePayload: RecordedToolPayload = {
        action,
        detail,
        id,
        ...(safeImages.length > 0 ? { images: safeImages } : {}),
        result: `Attached ${imageParts.length} image${imageParts.length === 1 ? '' : 's'} to the model`,
        state: 'done',
        tool: 'analyze_image',
      }
      emit('tool_call', donePayload)
      return {
        contextBlock: buildDirectAttachmentContext(imageParts),
        cost: 0,
        imageParts,
        ok: true,
        visionImages: 0,
      }
    }

    // Build OCR inputs: uploaded images (with their dataUrls) plus captured
    // element screenshots (mobile/tablet/desktop per selector).
    const ocrInputs = [
      ...imageAttachments.map((attachment) => ({
        dataUrl: attachment.dataUrl,
        sourceLabel: attachment.name,
      })),
      ...elementCaptures.flatMap((capture) =>
        capture.captures.map((viewport) => ({
          dataUrl: viewport.dataUrl,
          sourceLabel: `Element ${capture.selector} (${viewport.viewport})`,
        })),
      ),
    ]

    const result = await ocrImageInputs(
      ocrInputs,
      ATTACHMENT_OCR_PROMPT,
      visionModel,
      undefined,
      { signal },
    )
    const cost = visionCost(result.usage ?? {}, result.cost)
    const images = result.imagesAnalyzed
    // Record this OCR/vision call in vision-messages.json (text/usage/cost only).
    void appendVisionMessage(projectId, {
      costUsd: cost,
      imagesAnalyzed: result.imagesAnalyzed,
      model: visionModel,
      ok: result.ok,
      reason: result.reason,
      source: 'attachment',
      text: result.text,
      ts: new Date().toISOString(),
      turnId: recordedTurn.id,
      usage: result.usage,
    })

    recordAttachmentAnalysis(recordedTurn, result.text)

    if (!result.ok) {
      const reason = result.reason ?? 'Image analysis failed.'
      const errorPayload: RecordedToolPayload = {
        action,
        detail,
        id,
        result: reason,
        state: 'error',
        tool: 'analyze_image',
      }
      emit('tool_call', errorPayload)
      return {
        contextBlock: `Attached image analysis failed: ${reason}`,
        cost,
        imageParts: [],
        ok: false,
        visionImages: images,
      }
    }

    // Persist safe screenshot URLs for element captures so the conversation UI
    // can preview them without data URLs. Uploaded images are enriched
    // client-side from their dataUrl payload.
    const safeImages = elementCaptures.flatMap((capture) =>
      capture.captures.map((viewport) => ({
        alt: `Element ${capture.selector} (${viewport.viewport})`,
        url: expandScreenshotUrl(viewport.imageUrl, baseUrl),
      })),
    )
    const donePayload: RecordedToolPayload = {
      action,
      detail,
      id,
      ...(safeImages.length > 0 ? { images: safeImages } : {}),
      result: `Analyzed ${images} attached image${images === 1 ? '' : 's'}`,
      state: 'done',
      tool: 'analyze_image',
    }
    emit('tool_call', donePayload)
    return {
      contextBlock: buildAttachmentContext(
        attachments,
        elementCaptures,
        result,
        visionModel,
      ),
      cost,
      imageParts: [],
      ok: true,
      visionImages: images,
    }
  } catch (error) {
    signal.throwIfAborted()
    const reason = summarizeToolError(error)
    const errorPayload: RecordedToolPayload = {
      action,
      detail,
      id,
      result: reason,
      state: 'error',
      tool: 'analyze_image',
    }
    emit('tool_call', errorPayload)
    return {
      contextBlock: `Attached image analysis failed: ${reason}`,
      cost: 0,
      imageParts: [],
      ok: false,
      visionImages: 0,
    }
  }
}

function buildAgentMessages(
  history: ProjectMessageTurn[],
  rawByTurnId: ReadonlyMap<string, MastraDBMessage[]>,
  currentPrompt: string,
  currentImageParts: { dataUrl: string; label: string }[] = [],
): AgentReplayMessage[] {
  const currentMessage: AgentReplayMessage =
    currentImageParts.length > 0
      ? {
          content: [
            { text: currentPrompt, type: 'text' as const },
            ...currentImageParts.map((part) => ({
              image: part.dataUrl,
              type: 'image' as const,
            })),
          ],
          role: 'user' as const,
        }
      : { content: currentPrompt, role: 'user' as const }
  const messages: AgentReplayMessage[] = [
    ...history.flatMap((turn) => {
      const messages: AgentReplayMessage[] = []
      const userContent = buildHistoryUserContent(turn)
      if (userContent) messages.push({ content: userContent, role: 'user' })

      // Prefer the raw Mastra messages recorded for this turn (the real
      // assistant text + tool calls + tool results) over a lossy prose
      // reconstruction. Falls back when no raw messages were captured (e.g.
      // legacy turns from before raw persistence, or a failed/aborted turn).
      const rawMessages = rawByTurnId.get(turn.id)
      if (rawMessages && rawMessages.length > 0) {
        messages.push(...rawMessages)
      } else {
        const assistantContent = buildHistoryAssistantContent(turn)
        if (assistantContent) {
          messages.push({ content: assistantContent, role: 'assistant' })
        }
      }
      return messages
    }),
    currentMessage,
  ]

  return messages
}

function buildAttachmentContext(
  attachments: AgentAttachmentInput[],
  elementCaptures: CapturedProjectSelector[],
  result: ImageOcrResult,
  visionModel: string,
): string {
  const imageList = attachments
    .map((attachment, index) => {
      if (attachment.kind === 'element') {
        const capture = elementCaptures.find(
          (capture) => capture.selector === attachment.selector,
        )
        const viewports = capture
          ? capture.captures.map((viewport) => viewport.viewport).join('/')
          : 'unavailable'
        return `${index + 1}. Element ${attachment.selector} (captured: ${viewports})`
      }
      return `${index + 1}. ${attachment.name} (${attachment.mediaType}, ${attachment.size} bytes)`
    })
    .join('\n')
  return [
    `Attached image OCR/visual transcript from OpenRouter \`${visionModel}\`:`,
    imageList,
    '',
    result.text || 'No text returned.',
  ].join('\n')
}

function buildDirectAttachmentContext(
  imageParts: { dataUrl: string; label: string }[],
): string {
  const imageList = imageParts
    .map((part, index) => `${index + 1}. ${part.label}`)
    .join('\n')
  return [
    `${imageParts.length} image${imageParts.length === 1 ? '' : 's'} attached directly to this message (in order):`,
    imageList,
    '',
    'Inspect the attached image(s) visually and use them as design/content reference for the landing page.',
  ].join('\n')
}

function buildHistoryAssistantContent(turn: ProjectMessageTurn): null | string {
  const lines = turn.parts.flatMap((part) => {
    switch (part.type) {
      case 'stats':
        return []
      case 'text':
        return [part.text]
      case 'thinking':
      case 'tool_call':
        return []
    }
  })

  if (turn.error) lines.push(`Turn error: ${turn.error}`)
  return compactLines(lines)
}

function buildHistoryUserContent(turn: ProjectMessageTurn): null | string {
  const attachmentLines = (turn.attachments ?? []).flatMap(
    (attachment, index) => {
      if (attachment.kind === 'element') {
        return [
          `${index + 1}. Element ${attachment.selector ?? attachment.name}`,
          attachment.analysisText
            ? `OCR/visual transcript: ${attachment.analysisText}`
            : null,
        ]
      }
      return [
        `${index + 1}. ${attachment.name} (${attachment.mediaType ?? 'unknown'}, ${attachment.size ?? 0} bytes)`,
        attachment.analysisText
          ? `OCR/visual transcript: ${attachment.analysisText}`
          : null,
      ]
    },
  )

  return compactLines([
    turn.prompt,
    attachmentLines.length > 0 ? 'Attachments:' : null,
    ...attachmentLines,
  ])
}

function createHtmlUpdatePayload({
  html,
  previousHtml,
  projectId,
  sequence,
}: {
  html: string
  previousHtml: string
  projectId: string
  sequence: number
}): HtmlUpdatePayload {
  return {
    bytes: Buffer.byteLength(html, 'utf8'),
    hash: hashHtml(html),
    html,
    previousHash: hashHtml(previousHtml),
    projectId,
    sequence,
  }
}

function createRecordedTurn(
  prompt: string,
  model: string,
  attachments: ProjectMessageAttachment[] = [],
  turnId?: string,
): ProjectMessageTurn {
  return {
    ...(attachments.length > 0 ? { attachments } : {}),
    htmlSwaps: 0,
    id: turnId ?? `turn-${randomUUID()}`,
    isStreaming: true,
    model,
    parts: [],
    prompt,
  }
}

function hashHtml(html: string): string {
  return createHash('sha256').update(html).digest('hex')
}

function recordAttachmentAnalysis(
  turn: ProjectMessageTurn,
  analysisText: string,
) {
  if (!analysisText || !turn.attachments?.length) return
  turn.attachments = turn.attachments.map((attachment) => ({
    ...attachment,
    analysisText,
  }))
}

async function runAgentStream({
  attachments,
  baseUrl,
  controller,
  imageModel,
  project,
  projectId,
  prompt,
  textModel,
  turnId,
  visionModel,
}: RunBodyOptions) {
  await updateProjectModel(projectId, { textModel })
  setTitleIfUntitled(projectId, prompt)

  const recordedTurn = createRecordedTurn(
    prompt,
    textModel,
    attachments.map(stripAttachmentData),
    turnId,
  )

  // Mirror the client wire to `client-messages.jsonl` (the single source of
  // truth replayed on reopen) AND fan the event out to every run subscriber via
  // the bus. `html_update` is broadcast live but NOT appended — it carries full
  // HTML, the reducer ignores it, and terminal HTML already lives in html.json,
  // so logging it only bloats the SSOT. `appendClientMessage` serializes appends
  // per file, so fire-and-forget is safe and order-preserving.
  const emit = (event: string, payload: unknown) => {
    if (event !== 'html_update') {
      void appendClientMessage(projectId, {
        dir: 'out',
        event,
        payload,
        ts: new Date().toISOString(),
      } satisfies ClientMessageEntry)
    }
    broadcast(projectId, event, payload)
  }
  const startedAt = Date.now()
  const store = createProjectHtmlStore(projectId)
  let lastHtmlUpdate = store.get()
  let htmlUpdateSequence = 0
  // When the chat model accepts image inputs, screenshots/attached images go
  // straight to the model (direct mode); otherwise a separate vision model
  // OCRs them into transcripts (fallback mode).
  const directImages = await supportsImageInput(textModel, controller.signal)
  const agent = createLandingPageAgent(
    store,
    mastra,
    baseUrl,
    textModel,
    async (selector: string) => {
      const [result] = await captureProjectSelectors({
        html: store.get(),
        projectId,
        selectors: [selector],
        signal: controller.signal,
      })
      if (!result) {
        throw new Error('No capture returned for selector.')
      }
      return result
    },
    {
      directImages,
      imageModel,
      projectId,
      signal: controller.signal,
      turnId: recordedTurn.id,
      visionModel,
    },
  )

  // Record the inbound prompt (client→server) as the first client-messages line.
  void appendClientMessage(projectId, {
    attachmentCount: attachments.length,
    dir: 'in',
    model: textModel,
    prompt,
    ts: new Date().toISOString(),
    turnId: recordedTurn.id,
    type: 'prompt',
  } satisfies ClientMessageEntry)

  // Track per-call display state from provider toolCallId. The UI receives our
  // display id, not the raw provider id, so repeated provider ids cannot collapse
  // separate invocations into one rendered row.
  const callDisplay = new Map<string, ToolCallDisplay>()
  const completedCallIds = new Set<string>()
  // Track per-call action from the tool-call chunk (tool-result args can be
  // absent), so we can echo it on the done/error states too.
  const callAction = new Map<string, null | string>()
  let toolCallSeq = 0
  let fatalRunError: null | string = null
  // Fatal run errors are emitted once and abort the run; both the cost cap
  // (run-stats tracker) and the edit-failure circuit breaker escalate here.
  const fatal = (message: string) => {
    fatalRunError = message
    emit('error', { message })
    controller.abort()
  }
  // Per-run cost/stats accounting (provider-reported values only) — see
  // lib/run-stats.ts. Emits rolling `stats` snapshots; `checkCostCap`
  // escalates to `fatal` when the optional USD cap trips.
  const stats = createRunStatsTracker({
    emit,
    onFatal: fatal,
    startedAt,
    textModel,
  })

  // Hoisted above the try so both rolling snapshots and final accounting can
  // read the stream state when the loop throws (graceful stop / mid-stream
  // error), not only on the clean/break path.
  let agentStep = 0
  let stream: Awaited<ReturnType<typeof agent.stream>> | undefined
  let streamError: string | undefined

  try {
    // Persist the streaming turn (prompt + isStreaming) before any work so a
    // crash during attachment analysis or the agent run still leaves the prompt
    // and any later checkpoints recoverable on disk.
    const attachmentAnalysis = await analyzePromptAttachments({
      attachments,
      baseUrl,
      directImages,
      emit,
      nextToolSeq: () => ++toolCallSeq,
      projectId,
      recordedTurn,
      signal: controller.signal,
      store,
      visionModel,
    })
    // Surface the final attachment metadata (incl. OCR analysisText) so the
    // client-messages replay can reconstruct turn.attachments on reload. The
    // browser ignores this unknown event; only server-side hydration reads it.
    if (recordedTurn.attachments && recordedTurn.attachments.length > 0) {
      emit('attachments_update', { attachments: recordedTurn.attachments })
    }
    if (attachmentAnalysis.visionImages > 0) {
      stats.recordAttachmentVision({
        cost: attachmentAnalysis.cost,
        ok: attachmentAnalysis.ok,
        visionImages: attachmentAnalysis.visionImages,
      })
      if (stats.checkCostCap()) controller.signal.throwIfAborted()
    }

    const agentPrompt = attachmentAnalysis.contextBlock
      ? `${prompt}\n\n${attachmentAnalysis.contextBlock}`
      : prompt
    // Replay the real prior conversation (raw Mastra messages) when available
    // so the model sees previous tool calls and tool results, not a prose
    // paraphrase. The agent log holds per-step Mastra snapshots; take the last
    // snapshot per turn. Falls back to legacy raw-messages.json for old projects.
    const rawByTurnId = (await readAgentRawByTurn(
      projectId,
    )) as unknown as ReadonlyMap<string, MastraDBMessage[]>
    const agentMessages = buildAgentMessages(
      project.messages,
      rawByTurnId,
      agentPrompt,
      attachmentAnalysis.imageParts,
    )

    agentStep = 0
    let agentMessageList: {
      get?: { response?: { db?: () => MastraDBMessage[] } }
    }
    stream = await agent.stream(agentMessages, {
      abortSignal: controller.signal,
      errorProcessors: createLandingAgentErrorProcessors(
        config.agentRetry,
        (event) => {
          emit('retry', event)
        },
      ),
      includeRawChunks: true,
      maxProcessorRetries: config.agentRetry.streamErrorMaxRetries,
      maxSteps: MAX_STEPS,
      modelSettings: {
        maxOutputTokens: 16_384,
        maxRetries: config.agentRetry.modelMaxRetries,
        // GLM-5.2 sampling: Z.ai docs say tune EITHER temperature OR top_p
        // (never both). Default temperature 1.0; AGENT_TOP_P switches to
        // nucleus sampling instead. reasoning_effort is intentionally NOT set
        // here — the generic OpenAI-compatible path drops
        // providerOptions.openai.reasoningEffort, and GLM-5.2 defaults to
        // `max` (deep reasoning) when the param is omitted, which is the
        // recommended setting for coding/agentic use.
        ...(config.agentGeneration.topP != null
          ? { topP: config.agentGeneration.topP }
          : { temperature: config.agentGeneration.temperature }),
      },
      onStepFinish: () => {
        // Snapshot the real Mastra message list after each agent step and append
        // it (timestamped) to agent-messages.jsonl — the verbatim assistant/tool
        // messages, inspectable per step mid-run.
        const messages = agentMessageList?.get?.response?.db?.()
        if (messages && messages.length > 0) {
          agentStep += 1
          void appendAgentMessages(projectId, {
            dir: 'step',
            messages: sanitizeAgentMessages(messages) as ProjectRawMessage[],
            step: agentStep,
            ts: new Date().toISOString(),
            turnId: recordedTurn.id,
          } satisfies AgentMessageEntry)
        }
      },
    })
    agentMessageList = stream.messageList

    const handleChunk = createStreamChunkHandler({
      baseUrl,
      callAction,
      callDisplay,
      completedCallIds,
      emit,
      nextToolSeq: () => ++toolCallSeq,
      onEditSuccess: () => {
        const nextHtml = store.get()
        if (nextHtml === lastHtmlUpdate) return
        htmlUpdateSequence += 1
        emit(
          'html_update',
          createHtmlUpdatePayload({
            html: nextHtml,
            previousHtml: lastHtmlUpdate,
            projectId,
            sequence: htmlUpdateSequence,
          }),
        )
        lastHtmlUpdate = nextHtml
      },
      onFatal: fatal,
      persistImage: (imageId, ext) =>
        persistGeneratedImage(projectId, imageId, ext),
      stats,
    })
    streamLoop: for await (const chunk of stream.fullStream) {
      if (handleChunk(chunk) === 'break') break streamLoop
    }
  } catch (error) {
    // Capture (don't emit yet) so `finally` can run cost/stats accounting
    // first — the user sees what an aborted/errored run actually spent. A
    // fatal run error was already emitted during the loop and owns the
    // terminal message.
    if (!fatalRunError) {
      const aborted = controller.signal.aborted
      streamError = aborted
        ? 'stopped'
        : error instanceof Error
          ? error.message
          : 'Unknown error'
    }
  } finally {
    try {
      agentStep = await finalizeRun({
        agentStep,
        controller,
        emit,
        fatalRunError,
        htmlUpdateSequence,
        project,
        projectId,
        recordedTurn,
        stats,
        stream,
        streamError,
      })
    } finally {
      emit('done', {})
    }
  }
}

/**
 * Run body wrapper: owns run-lifecycle cleanup. `runAgentStream` does the
 * actual work (attachment OCR, agent.stream, event loop, cost accounting,
 * terminal emit); this wrapper guarantees the run slot is released + logs
 * flushed even if it throws OUTSIDE its own try/catch (a bug), terminalizing
 * status to `error` so the project never gets stuck `running`.
 */
async function runLandingAgentBody(options: RunBodyOptions) {
  const { entry, projectId } = options
  try {
    await runAgentStream(options)
  } catch (error) {
    console.error(
      `[landing-agent] run body crashed for project ${projectId}:`,
      error,
    )
    setRunStatusSync(projectId, {
      error: error instanceof Error ? error.message : 'Unknown error',
      finishedAt: new Date().toISOString(),
      status: 'error',
    })
  } finally {
    try {
      await flushProjectLogs(projectId)
    } catch {
      // Best-effort log flush; the run already terminalized its status.
    }
    releaseRun(projectId, entry)
  }
}

/** Sanitize Mastra messages before persisting to agent-messages.jsonl:
 *  strip reasoning parts + inline image bytes. */
function sanitizeAgentMessages(messages: MastraDBMessage[]): MastraDBMessage[] {
  return stripReasoning(messages).map(
    (message) => stripInlineImageData(message) as MastraDBMessage,
  )
}

function stripAttachmentData(
  attachment: AgentAttachmentInput,
): ProjectMessageAttachment {
  if (attachment.kind === 'element') {
    return {
      id: `element-${randomUUID()}`,
      kind: 'element',
      name: `Element ${attachment.selector}`,
      selector: attachment.selector,
    }
  }
  const { dataUrl: _dataUrl, ...metadata } = attachment
  return metadata
}

const OMITTED_INLINE_IMAGE = '[omitted inline image bytes]'

/** Replace inline base64 image payloads (`data:image/...` strings, media
 *  parts) with a placeholder. Direct-mode screenshot tool results carry
 *  capture data URLs; base64 must never land in JSON logs (log bloat) — the
 *  persisted imageUrl stays as the durable pointer. */
function stripInlineImageData<T>(value: T): T {
  if (typeof value === 'string') {
    return (value.startsWith('data:image/') ? OMITTED_INLINE_IMAGE : value) as T
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripInlineImageData(item)) as T
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        stripInlineImageData(item),
      ]),
    ) as T
  }
  return value
}

/** Strip `reasoning` parts (the model's private chain-of-thought) from Mastra
 *  messages before persisting them to agent-messages.jsonl. Every decision
 *  reasoning informed is already captured by the tool-invocation calls/results
 *  and text we keep, so replaying it only inflates the next turn's prompt
 *  (observed +73K input tokens on a 2-line edit) without aiding fidelity. */
function stripReasoning(messages: MastraDBMessage[]): MastraDBMessage[] {
  return messages.map((message) => {
    const parts = message.content?.parts
    if (!Array.isArray(parts)) return message
    const kept = parts.filter((part) => part?.type !== 'reasoning')
    if (kept.length === parts.length) return message
    return { ...message, content: { ...message.content, parts: kept } }
  })
}
