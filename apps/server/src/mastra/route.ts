import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'

import type { Agent as AgentType } from '@mastra/core/agent'
import type { MastraDBMessage } from '@mastra/core/agent/message-list'

import {
  createRunCoordinator,
  type RunAttachmentInput,
  type RunExecutionContext,
  type RunExecutionResult,
  type RunStartResult,
} from '../application/run-coordinator.ts'
import { config } from '../config.ts'
import type {
  OperationScope,
  OperationScopeFactory,
} from '../providers/operation-scope.ts'
import { OperationDrainError } from '../providers/operation-scope.ts'
import type { ProviderTransport } from '../providers/transport.ts'
import { visionCost } from './lib/cost.ts'
import type { HtmlStore } from './lib/html-store.ts'
import { ocrImageInputs, type ImageOcrResult } from './lib/image-ocr.ts'
import type { ModelCapabilities } from './lib/model-capabilities.ts'
import {
  captureProjectSelectors,
  type CapturedProjectSelector,
} from './lib/project-screenshot.ts'
import type {
  AgentMessageEntry,
  ClientMessageEntry,
  ProjectMessageAttachment,
  ProjectMessageToolCallPart,
  ProjectMessageTurn,
  ProjectRawMessage,
  ProjectRepository,
} from './lib/project-store.ts'
import { createLandingAgentErrorProcessors } from './lib/retry.ts'
import type { RunBus } from './lib/run-bus.ts'
import {
  finalizeRun,
  RunMetadataTimeoutError,
  sanitizeAgentMessages,
} from './lib/run-finalize.ts'
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

export type AgentAttachmentInput = RunAttachmentInput

export type AgentElementAttachmentInput = Extract<
  RunAttachmentInput,
  { kind: 'element' }
>

export type AgentImageAttachmentInput = Exclude<
  RunAttachmentInput,
  { kind: 'element' }
>

/**
 * Start a landing-page agent run for a project and return IMMEDIATELY with the
 * resolved turn id. The run is decoupled from the request: it proceeds in the
 * background, broadcasting events to run-bus subscribers (reopened tabs via
 * `GET /api/projects/:id/events`). The originating `POST /agent` caller gets
 * the JSON ack here and tracks progress via the subscribe endpoint — so closing
 * that tab is delivery loss, not cancellation. The application coordinator
 * owns durable lifecycle records and projects their public status. Returns
 * `not_found` when the project is missing or `overlap` when a run is active.
 */
export interface LandingAgentFactory {
  (
    store: HtmlStore,
    baseUrl: string,
    textModel: string,
    captureProjectSelector: (
      selector: string,
    ) => Promise<CapturedProjectSelector>,
    options: {
      directImages?: boolean
      imageModel?: string
      operations?: OperationScope
      projectId?: string
      signal?: AbortSignal
      transport?: ProviderTransport
      turnId?: string
      visionModel?: string
    },
  ): AgentType
}

export type LandingAgentRunner = ReturnType<typeof createLandingAgentRunner>

export interface LandingAgentRunnerDependencies {
  bus: RunBus
  capabilities: ModelCapabilities
  captureProjectSelectors: typeof captureProjectSelectors
  createAgent: LandingAgentFactory
  createOperationScope?: OperationScopeFactory
  ocrImageInputs: typeof ocrImageInputs
  repository: ProjectRepository
  runtimeConfig: Pick<
    typeof config,
    | 'agentGeneration'
    | 'agentMaxCostUsd'
    | 'agentRetry'
    | 'firecrawl'
    | 'openrouter'
    | 'providerExecution'
  >
  transport: ProviderTransport
}

export type StartAgentResult = RunStartResult

/** Multimodal user-message content part (current-prompt attachments). */
type AgentUserContentPart =
  | { image: string; type: 'image' }
  | { text: string; type: 'text' }

interface AttachmentAnalysis {
  contextBlock: string
  cost: number
  imageParts: { dataUrl: string; label: string }[]
  ok: boolean
  screenshotCredits: number
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

type RunBodyOptions = RunExecutionContext

export class LandingAgentRunnerDisposedError extends Error {
  constructor() {
    super('Landing agent runner is disposed.')
    this.name = 'LandingAgentRunnerDisposedError'
  }
}

export function createLandingAgentRunner({
  bus,
  capabilities,
  captureProjectSelectors,
  createAgent,
  createOperationScope: createScope,
  ocrImageInputs,
  repository,
  runtimeConfig,
  transport,
}: LandingAgentRunnerDependencies) {
  async function analyzePromptAttachments({
    attachments,
    baseUrl,
    directImages,
    emit,
    nextToolSeq,
    operations,
    projectId,
    recordedTurn,
    signal,
    store,
    transport,
    visionModel,
  }: {
    attachments: AgentAttachmentInput[]
    baseUrl: string
    directImages: boolean
    emit: (event: string, payload: unknown) => void
    nextToolSeq: () => number
    operations: OperationScope
    projectId: string
    recordedTurn: ProjectMessageTurn
    signal: AbortSignal
    store: HtmlStore
    transport: ProviderTransport
    visionModel: string
  }): Promise<AttachmentAnalysis> {
    if (attachments.length === 0) {
      return {
        contextBlock: '',
        cost: 0,
        imageParts: [],
        ok: true,
        screenshotCredits: 0,
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
    const analyzeStartedAt = Date.now()
    const analyzeDurationMs = () => Math.max(0, Date.now() - analyzeStartedAt)
    const runningPayload: RecordedToolPayload = {
      action,
      detail,
      id,
      startedAt: analyzeStartedAt,
      state: 'running',
      tool: 'analyze_image',
    }
    emit('tool_call', runningPayload)

    let screenshotCredits = 0

    try {
      // Capture selected-element selectors server-side into safe persisted
      // screenshots. One publish + three viewport scrapes handle all selectors.
      let elementCaptures: CapturedProjectSelector[] = []
      if (elementSelectors.length > 0) {
        elementCaptures = await captureProjectSelectors(
          {
            html: store.get(),
            operations,
            projectId,
            selectors: elementSelectors,
            signal,
            transport,
          },
          {
            firecrawl: runtimeConfig.firecrawl,
            inlineProjectImages: repository.inlineProjectImagesForCapture,
            persistScreenshot: repository.writeProjectScreenshotSync,
          },
        )
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
          durationMs: analyzeDurationMs(),
          id,
          ...(safeImages.length > 0 ? { images: safeImages } : {}),
          result: `Attached ${imageParts.length} image${imageParts.length === 1 ? '' : 's'} to the model`,
          startedAt: analyzeStartedAt,
          state: 'done',
          tool: 'analyze_image',
        }
        emit('tool_call', donePayload)
        return {
          contextBlock: buildDirectAttachmentContext(imageParts),
          cost: 0,
          imageParts,
          ok: true,
          screenshotCredits,
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
        { operations, signal, source: 'attachment', transport },
      )
      const cost = visionCost(result.usage ?? {}, result.cost)
      const images = result.imagesAnalyzed
      // Record this OCR/vision call in vision-messages.json (text/usage/cost only).
      void repository.appendVisionMessage(projectId, {
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
          durationMs: analyzeDurationMs(),
          id,
          result: reason,
          startedAt: analyzeStartedAt,
          state: 'error',
          tool: 'analyze_image',
        }
        emit('tool_call', errorPayload)
        return {
          contextBlock: `Attached image analysis failed: ${reason}`,
          cost,
          imageParts: [],
          ok: false,
          screenshotCredits,
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
        durationMs: analyzeDurationMs(),
        id,
        ...(safeImages.length > 0 ? { images: safeImages } : {}),
        result: `Analyzed ${images} attached image${images === 1 ? '' : 's'}`,
        startedAt: analyzeStartedAt,
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
        screenshotCredits,
        visionImages: images,
      }
    } catch (error) {
      signal.throwIfAborted()
      const reason = summarizeToolError(error)
      const errorPayload: RecordedToolPayload = {
        action,
        detail,
        durationMs: analyzeDurationMs(),
        id,
        result: reason,
        startedAt: analyzeStartedAt,
        state: 'error',
        tool: 'analyze_image',
      }
      emit('tool_call', errorPayload)
      return {
        contextBlock: `Attached image analysis failed: ${reason}`,
        cost: 0,
        imageParts: [],
        ok: false,
        screenshotCredits,
        visionImages: 0,
      }
    }
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

  /**
   * Build the ONLY message sent to the agent for this run. Observational Memory
   * owns prior-turn history via the project thread, so replaying full history
   * here would duplicate stored messages (OM contract: send just the new
   * message). Multimodal when the chat model accepts image inputs and the
   * prompt carried direct attachments.
   */
  function buildCurrentUserMessage(
    currentPrompt: string,
    currentImageParts: { dataUrl: string; label: string }[] = [],
  ): string | { content: AgentUserContentPart[]; role: 'user' } {
    if (currentImageParts.length === 0) return currentPrompt
    return {
      content: [
        { text: currentPrompt, type: 'text' as const },
        ...currentImageParts.map((part) => ({
          image: part.dataUrl,
          type: 'image' as const,
        })),
      ],
      role: 'user' as const,
    }
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
    compactionPercent,
    controller,
    imageModel,
    operations,
    project,
    projectId,
    prompt,
    setUsageReporter,
    textModel,
    turnId,
    visionModel,
  }: RunBodyOptions) {
    await repository.updateProjectModel(projectId, { textModel })

    const recordedTurn = createRecordedTurn(
      prompt,
      textModel,
      attachments.map(stripAttachmentData),
      turnId,
    )

    // Commit each replayable event before publishing it to run subscribers.
    // `html_update` remains live-only, but shares this queue so wire order stays
    // aligned with the durable events around it. The first append failure aborts
    // the run and blocks every later queued publication.
    const emissions = createCommittedEmissionQueue({
      bus,
      controller,
      projectId,
      repository,
      turnId,
    })
    const initialMeta = repository.setTitleIfUntitled(projectId, prompt)
    if (initialMeta) {
      emissions.emit('project_meta', {
        brief: initialMeta.brief,
        imageModel: initialMeta.imageModel,
        model: initialMeta.model,
        title: initialMeta.title,
        titleSource: initialMeta.titleSource,
        visionModel: initialMeta.visionModel,
      })
    }
    let streamFailure: unknown
    let executionResult: RunExecutionResult | undefined
    try {
      const emit = emissions.emit
      const startedAt = Date.now()
      const store = repository.createProjectHtmlStore(projectId)
      let lastHtmlUpdate = store.get()
      let htmlUpdateSequence = 0
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
        controller.abort()
      }
      // Per-run cost/stats accounting (provider-reported values only) — see
      // lib/run-stats.ts. Emits rolling `stats` snapshots; `checkCostCap`
      // escalates to `fatal` when the optional USD cap trips.
      const stats = createRunStatsTracker({
        costCapUsd: runtimeConfig.agentMaxCostUsd,
        emit,
        firecrawlCreditUsd: runtimeConfig.firecrawl.creditUsd,
        onFatal: fatal,
        startedAt,
        textModel,
      })
      setUsageReporter(stats.recordProviderUsage)

      // Hoisted above the try so rolling snapshots and final accounting can
      // observe failures during capability discovery, attachments, or streaming.
      let agentStep = 0
      let stream: Awaited<ReturnType<AgentType['stream']>> | undefined
      let streamError: string | undefined

      try {
        // When the chat model accepts image inputs, screenshots/attached images go
        // straight to the model (direct mode); otherwise a separate vision model
        // OCRs them into transcripts (fallback mode).
        const directImages = await capabilities.supportsImageInput(
          textModel,
          controller.signal,
          operations,
        )
        operations.signal.throwIfAborted()
        // Autocompaction threshold: user-set percent of the text model's catalog
        // context window (one shared catalog fetch with the capability check).
        // Undefined when unset or the window is unknown — OM's default applies.
        const contextWindow =
          compactionPercent != null
            ? await capabilities.contextWindowTokens(
                textModel,
                controller.signal,
                operations,
              )
            : undefined
        operations.signal.throwIfAborted()
        const omMessageTokens =
          compactionPercent != null && contextWindow != null
            ? Math.max(
                1_000,
                Math.round((contextWindow * compactionPercent) / 100),
              )
            : undefined
        const agent = createAgent(
          store,
          baseUrl,
          textModel,
          async (selector: string) => {
            const [result] = await captureProjectSelectors(
              {
                html: store.get(),
                operations,
                projectId,
                selectors: [selector],
                signal: controller.signal,
                transport,
              },
              {
                firecrawl: runtimeConfig.firecrawl,
                inlineProjectImages: repository.inlineProjectImagesForCapture,
                persistScreenshot: repository.writeProjectScreenshotSync,
              },
            )
            if (!result) {
              throw new Error('No capture returned for selector.')
            }
            return result
          },
          {
            directImages,
            imageModel,
            operations,
            projectId,
            signal: controller.signal,
            transport,
            turnId: recordedTurn.id,
            visionModel,
          },
        )

        // Persist the streaming turn (prompt + isStreaming) before any work so a
        // crash during attachment analysis or the agent run still leaves the prompt
        // and any later checkpoints recoverable on disk.
        const attachmentAnalysis = await analyzePromptAttachments({
          attachments,
          baseUrl,
          directImages,
          emit,
          nextToolSeq: () => ++toolCallSeq,
          operations,
          projectId,
          recordedTurn,
          signal: controller.signal,
          store,
          transport,
          visionModel,
        })
        // Surface the final attachment metadata (incl. OCR analysisText) so the
        // client-messages replay can reconstruct turn.attachments on reload. The
        // browser ignores this unknown event; only server-side hydration reads it.
        if (recordedTurn.attachments && recordedTurn.attachments.length > 0) {
          emit('attachments_update', { attachments: recordedTurn.attachments })
        }
        if (stats.checkCostCap()) controller.signal.throwIfAborted()

        const agentPrompt = attachmentAnalysis.contextBlock
          ? `${prompt}\n\n${attachmentAnalysis.contextBlock}`
          : prompt
        // Observational Memory owns prior-turn history via the project thread —
        // send ONLY the new user message (see buildCurrentUserMessage).
        const currentMessage = buildCurrentUserMessage(
          agentPrompt,
          attachmentAnalysis.imageParts,
        )

        agentStep = 0
        let agentMessageList: {
          get?: { response?: { db?: () => MastraDBMessage[] } }
        }
        stream = await agent.stream(currentMessage, {
          abortSignal: controller.signal,
          errorProcessors: createLandingAgentErrorProcessors(
            runtimeConfig.agentRetry,
            (event) => {
              emit('retry', event)
            },
          ),
          includeRawChunks: true,
          maxProcessorRetries: runtimeConfig.agentRetry.streamErrorMaxRetries,
          maxSteps: MAX_STEPS,
          memory: {
            resource: projectId,
            thread: projectId,
            // User-configured autocompaction threshold: percent of the text
            // model's catalog context window → OM observation.messageTokens.
            // Omitted when unset or the window is unknown (OM default applies).
            ...(omMessageTokens != null
              ? {
                  options: {
                    observationalMemory: {
                      observation: { messageTokens: omMessageTokens },
                    },
                  },
                }
              : {}),
          },
          modelSettings: {
            maxOutputTokens: 16_384,
            maxRetries: runtimeConfig.agentRetry.modelMaxRetries,
            // GLM-5.2 sampling: Z.ai docs say tune EITHER temperature OR top_p
            // (never both). Default temperature 1.0; AGENT_TOP_P switches to
            // nucleus sampling instead. reasoning_effort is intentionally NOT set
            // here — the generic OpenAI-compatible path drops
            // providerOptions.openai.reasoningEffort, and GLM-5.2 defaults to
            // `max` (deep reasoning) when the param is omitted, which is the
            // recommended setting for coding/agentic use. OpenRouter-native
            // reasoning control flows through providerOptions.openrouter below
            // (spreads verbatim into the wire body), only when configured.
            ...(runtimeConfig.agentGeneration.topP != null
              ? { topP: runtimeConfig.agentGeneration.topP }
              : { temperature: runtimeConfig.agentGeneration.temperature }),
          },
          ...(() => {
            const { reasoningEffort, reasoningMaxTokens } =
              runtimeConfig.agentGeneration
            if (reasoningMaxTokens != null) {
              return {
                providerOptions: {
                  openrouter: { reasoning: { max_tokens: reasoningMaxTokens } },
                },
              }
            }
            if (reasoningEffort) {
              return {
                providerOptions: {
                  openrouter: { reasoning: { effort: reasoningEffort } },
                },
              }
            }
            return {}
          })(),
          onStepFinish: () => {
            // Snapshot the real Mastra message list after each agent step and append
            // it (timestamped) to agent-messages.jsonl — the verbatim assistant/tool
            // messages, inspectable per step mid-run.
            const messages = agentMessageList?.get?.response?.db?.()
            if (messages && messages.length > 0) {
              agentStep += 1
              void repository.appendAgentMessages(projectId, {
                dir: 'step',
                messages: sanitizeAgentMessages(
                  messages,
                ) as ProjectRawMessage[],
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
      }
      const drained = await operations.drain()
      const operationDrainError = drained.ok
        ? undefined
        : new OperationDrainError(drained)
      if (operationDrainError) {
        const message = operationDrainError.message
        fatalRunError ??= message
        controller.abort(operationDrainError)
        let metadataSettlement: Promise<{
          reason?: string
          stats: Record<string, unknown>
        }>
        try {
          const finalized = await finalizeRun({
            agentStep,
            controller,
            fatalRunError,
            htmlUpdateSequence,
            metadataTimeoutMs:
              runtimeConfig.providerExecution.metadataTimeoutMs,
            project,
            projectId,
            recordedTurn,
            repository,
            stats,
            stream,
            streamError,
          })
          metadataSettlement = Promise.resolve({
            reason: message,
            stats: finalized.stats,
          })
        } catch (error) {
          if (!(error instanceof RunMetadataTimeoutError)) throw error
          metadataSettlement = error.settlement.then((settled) => ({
            reason: message,
            stats: settled,
          }))
        }
        executionResult = {
          knownUsage: stats.snapshot('incomplete'),
          outcome: 'blocked',
          reason: message,
          settlement: Promise.all([
            operations.waitForSettled(),
            metadataSettlement,
          ]).then(([, settled]) => ({
            reason: settled.reason,
            stats: stats.snapshot(
              typeof settled.stats.finishReason === 'string'
                ? settled.stats.finishReason
                : 'error',
            ),
          })),
        }
      } else {
        try {
          const finalized = await finalizeRun({
            agentStep,
            controller,
            fatalRunError,
            htmlUpdateSequence,
            metadataTimeoutMs:
              runtimeConfig.providerExecution.metadataTimeoutMs,
            project,
            projectId,
            recordedTurn,
            repository,
            stats,
            stream,
            streamError,
          })
          agentStep = finalized.agentStep
          executionResult = finalized
        } catch (error) {
          if (error instanceof RunMetadataTimeoutError) {
            executionResult = {
              knownUsage: stats.snapshot('incomplete'),
              outcome: 'blocked',
              reason: error.message,
              settlement: error.settlement.then((settled) => ({
                reason: error.message,
                stats: settled,
              })),
            }
          } else {
            throw error
          }
        }
      }
    } catch (error) {
      streamFailure = error
    }

    let drainFailure: unknown
    try {
      await emissions.flush()
    } catch (error) {
      drainFailure = error
    }
    if (
      executionResult?.outcome === 'blocked' &&
      (streamFailure !== undefined || drainFailure !== undefined)
    ) {
      const blocked = executionResult
      const reason =
        'Agent event persistence failed while run work was unsettled.'
      return {
        ...blocked,
        reason,
        settlement: blocked.settlement.then((settled) => ({
          ...settled,
          reason,
        })),
      }
    }
    if (streamFailure !== undefined && drainFailure !== undefined) {
      throw new AggregateError(
        [streamFailure, drainFailure],
        'Agent stream and durable event drain failed.',
      )
    }
    if (streamFailure !== undefined) throw streamFailure
    if (drainFailure !== undefined) throw drainFailure
    if (!executionResult) throw new Error('Agent run produced no result.')
    return executionResult
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

  return createRunCoordinator({
    bus,
    ...(createScope ? { createOperationScope: createScope } : {}),
    defaultImageModel: runtimeConfig.openrouter.defaultImageModel,
    defaultTextModel: runtimeConfig.openrouter.defaultChatModel,
    defaultVisionModel: runtimeConfig.openrouter.defaultVisionModel,
    drainGraceMs: runtimeConfig.providerExecution.drainGraceMs,
    execute: runAgentStream,
    operationTimeoutMs: runtimeConfig.providerExecution.operationTimeoutMs,
    repository,
  })
}

export function resolveModelId(
  model?: string,
  defaultModel: string = config.openrouter.defaultChatModel,
): string {
  const requested = model ?? defaultModel
  // Allow a model dropdown to send either the bare id or the openrouter/ prefix.
  return requested.startsWith('openrouter/')
    ? requested.slice('openrouter/'.length)
    : requested
}

function createCommittedEmissionQueue({
  bus,
  controller,
  projectId,
  repository,
  turnId,
}: {
  bus: RunBus
  controller: AbortController
  projectId: string
  repository: ProjectRepository
  turnId: string
}) {
  let failed = false
  let firstError: unknown
  let queue: Promise<void> = Promise.resolve()

  function enqueue(run: () => Promise<void> | void): void {
    const operation = queue.then(async () => {
      if (failed) throw firstError
      await run()
    })
    queue = operation.catch((error: unknown) => {
      if (!failed) firstError = error
      failed = true
      controller.abort()
    })
  }

  function emit(event: string, payload: unknown): void {
    const ts = new Date().toISOString()
    enqueue(async () => {
      if (event === 'html_update') {
        const html =
          payload && typeof payload === 'object' && 'html' in payload
            ? (payload as { html?: unknown }).html
            : undefined
        if (typeof html === 'string') {
          await repository.commitDocumentChange(projectId, turnId)
          const meta = repository.readProjectMetaSync(projectId)
          if (meta) {
            await repository.appendClientMessage(projectId, {
              dir: 'out',
              event: 'project_meta',
              payload: {
                brief: meta.brief,
                imageModel: meta.imageModel,
                model: meta.model,
                title: meta.title,
                titleSource: meta.titleSource,
                visionModel: meta.visionModel,
              },
              ts,
              turnId: null,
            } satisfies ClientMessageEntry)
          }
        }
      } else {
        await repository.appendClientMessage(projectId, {
          dir: 'out',
          event,
          payload,
          ts,
          turnId: event === 'project_meta' ? null : turnId,
        } satisfies ClientMessageEntry)
      }
      bus.broadcast(projectId, event, payload)
    })
  }

  return {
    emit,
    async flush(): Promise<void> {
      await queue
      if (failed) throw firstError
    },
  }
}
