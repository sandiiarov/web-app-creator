import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

import type { MastraDBMessage } from '@mastra/core/agent/message-list'

import { config } from '../config.ts'
import { createLandingPageAgent } from './agents/landing-page-agent.ts'
import { mastra } from './index.ts'
import { createPendingBrowserScreenshot } from './lib/browser-screenshot.ts'
import {
  calculateLlmCost,
  firecrawlCost,
  imageGenCost,
  providerReportedCost,
  visionCost,
} from './lib/cost.ts'
import { ocrImageInputs, type ImageOcrResult } from './lib/image-ocr.ts'
import {
  appendAgentMessages,
  appendClientMessage,
  appendVisionMessage,
  flushProjectLogs,
  createProjectHtmlStore,
  getProject,
  persistGeneratedImage,
  readAgentRawByTurn,
  setTitleIfUntitled,
  updateProjectModel,
  type AgentMessageEntry,
  type ClientMessageEntry,
  type Project,
  type ProjectMessageAttachment,
  type ProjectMessageStatsPart,
  type ProjectMessageToolCallPart,
  type ProjectMessageTurn,
  type ProjectRawMessage,
} from './lib/project-store.ts'
import { createLandingAgentErrorProcessors } from './lib/retry.ts'
import { endSse, sendSse, startSse } from './lib/sse.ts'

const ATTACHMENT_OCR_PROMPT =
  'Analyze the attached image for landing-page generation. Extract all visible text exactly, then describe layout, hierarchy, colors, typography, UI components, imagery, brand cues, and any details the landing-page agent should use. If the image is a screenshot or mockup, call out sections, navigation, CTAs, spacing, and visual style.'
const MAX_EDIT_FAILURES = 10
const MAX_STEPS = 30
const REPEATED_EDIT_FAILURE_MESSAGE = `Edit failed ${MAX_EDIT_FAILURES} times in this turn. Stopping so the agent does not keep making blind edit attempts. Read/find the current project HTML and try again.`
const INVALID_EDIT_RESULT_MESSAGE =
  'Edit failed: the diff was missing or malformed. Retry with edit({ action, diff: "[index.html#TAG]\\nSWAP N.=M:\\n+TEXT" }) using the #TAG from your latest read/find.'
const NO_GENERATED_HTML_MESSAGE =
  'Agent finished without generating project HTML. The draft still has no content because no successful edit changed the page.'
const SCREENSHOT_UNAVAILABLE_REASON =
  'No browser client captured the previous screenshot request (timed out). Skip the screenshot tool and review by reading the project HTML instead.'

export type AgentAttachmentInput =
  | AgentElementAttachmentInput
  | AgentImageAttachmentInput

export interface AgentElementAttachmentInput extends ProjectMessageAttachment {
  dataUrl: string
  html: string
  kind: 'element'
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp'
  screenshotHeight: number
  screenshotWidth: number
}

export interface AgentImageAttachmentInput extends ProjectMessageAttachment {
  dataUrl: string
  kind?: 'image'
}

type AgentConversationMessage =
  | { content: string; role: 'assistant' }
  | { content: string; role: 'user' }

/**
 * Items fed back to `agent.stream` for history replay. Either a reconstructed
 * `{content, role}` message (user prompt text) or a verbatim persisted
 * `MastraDBMessage` carrying the real assistant text, tool calls, and tool
 * results from a prior turn.
 */
type AgentReplayMessage = AgentConversationMessage | MastraDBMessage

interface AttachmentAnalysis {
  contextBlock: string
  cost: number
  images: number
  ok: boolean
}

interface HtmlUpdatePayload {
  bytes: number
  hash: string
  html: string
  previousHash: string
  projectId: string
  sequence: number
}

type RecordedStatsPayload = Omit<ProjectMessageStatsPart, 'type'>
type RecordedToolPayload = Omit<ProjectMessageToolCallPart, 'type'>

interface StreamOptions {
  attachments?: AgentAttachmentInput[]
  imageModel?: string
  projectId: string
  prompt: string
  request: IncomingMessage
  response: ServerResponse
  textModel: string
  visionModel?: string
}

interface ActiveStreamOptions {
  attachments: AgentAttachmentInput[]
  controller: AbortController
  imageModel: string
  project: Project
  projectId: string
  prompt: string
  request: IncomingMessage
  response: ServerResponse
  textModel: string
  visionModel: string
}

type ToolArgs = Record<string, unknown>

interface ToolCallDisplay {
  action: null | string
  detail: null | string
  id: string
  tool: string
}

export function resolveModelId(model?: string): string {
  const requested = model ?? config.openrouter.defaultChatModel
  // Allow a model dropdown to send either the bare id or the openrouter/ prefix.
  return requested.startsWith('openrouter/')
    ? requested.slice('openrouter/'.length)
    : requested
}

/**
 * Active landing-agent runs keyed by projectId. A graceful stop (see
 * `stopLandingAgent`) aborts the run's Mastra stream WITHOUT closing the SSE
 * response, so the run still flushes its terminal cost/stats before `done` and
 * the client can show what a stopped run spent. A client disconnect still
 * aborts via the `request('close')` listener as a fallback. The map is mutated
 * only inside `streamLandingAgent` (register on start, conditional delete in
 * `finally`).
 */
const activeRuns = new Map<string, AbortController>()

/**
 * Gracefully stop the active run for a project: aborts its Mastra stream but
 * leaves the SSE response open so final cost/stats + `done` are delivered.
 * Returns whether an active run was found and aborted.
 */
export function stopLandingAgent(projectId: string): boolean {
  const controller = activeRuns.get(projectId)
  if (!controller) return false
  controller.abort()
  return true
}

/**
 * Run the landing-page agent and stream the custom SSE protocol by mapping
 * Mastra `fullStream` chunks. Emits: thinking, text, tool_call (with action +
 * terminal error/result states), stats, error, done. Cost/stats accounting runs
 * in `finally` so a `stats` event is emitted even when the loop throws (client
 * stop / mid-stream error), not only on the clean/break path.
 */
export async function streamLandingAgent({
  attachments = [],
  imageModel = config.openrouter.defaultImageModel,
  projectId,
  prompt,
  request,
  response,
  textModel,
  visionModel = config.openrouter.defaultVisionModel,
}: StreamOptions) {
  const project = await getProject(projectId)
  if (!project) {
    startSse(response, 404)
    sendSse(response, 'error', { message: 'Project not found' })
    sendSse(response, 'done', {})
    endSse(response)
    return
  }

  const controller = new AbortController()
  if (activeRuns.has(projectId)) {
    startSse(response)
    sendSse(response, 'error', {
      message: 'A run is already active for this project.',
    })
    sendSse(response, 'done', {})
    endSse(response)
    return
  }
  activeRuns.set(projectId, controller)

  const onClose = () => controller.abort()
  request.on('close', onClose)
  startSse(response)

  try {
    await streamActiveLandingAgent({
      attachments,
      controller,
      imageModel,
      project,
      projectId,
      prompt,
      request,
      response,
      textModel,
      visionModel,
    })
  } finally {
    if (activeRuns.get(projectId) === controller) activeRuns.delete(projectId)
    request.off('close', onClose)
    try {
      await flushProjectLogs(projectId)
    } finally {
      endSse(response)
    }
  }
}

async function streamActiveLandingAgent({
  attachments,
  controller,
  imageModel,
  project,
  projectId,
  prompt,
  request,
  response,
  textModel,
  visionModel,
}: ActiveStreamOptions) {
  await updateProjectModel(projectId, { textModel })
  setTitleIfUntitled(projectId, prompt)

  const recordedTurn = createRecordedTurn(
    prompt,
    textModel,
    attachments.map(stripAttachmentData),
  )

  // Debug: mirror the client wire to `client-messages.jsonl`. Every SSE event we
  // emit to the browser is also appended (timestamped, dir:"out") so the exact
  // client-visible data at any moment is inspectable mid-run. `appendClientMessage`
  // serializes appends per file, so fire-and-forget is safe and order-preserving.
  const emit = (event: string, payload: unknown) => {
    void appendClientMessage(projectId, {
      dir: 'out',
      event,
      payload,
      ts: new Date().toISOString(),
    } satisfies ClientMessageEntry)
    sendSse(response, event, payload)
  }
  const startedAt = Date.now()
  const store = createProjectHtmlStore(projectId)
  let lastHtmlUpdate = store.get()
  let htmlUpdateSequence = 0
  const baseUrl = `http://${request.headers.host ?? `localhost:${config.port}`}`
  // Memoize screenshot timeouts: once a request times out (no browser client
  // captured it), fail subsequent screenshot calls fast with an actionable
  // reason instead of waiting through the full timeout on every retry.
  let screenshotUnavailable = false
  const agent = createLandingPageAgent(
    store,
    mastra,
    baseUrl,
    textModel,
    async ({ selector, timeoutMs, viewportSize }) => {
      if (screenshotUnavailable) {
        throw new Error(SCREENSHOT_UNAVAILABLE_REASON)
      }
      const { promise, requestId } = createPendingBrowserScreenshot({
        projectId,
        timeoutMs,
      })
      emit('screenshot_request', {
        projectId,
        requestId,
        selector,
        viewportSize,
      })
      try {
        return await promise
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        if (reason.includes('timed out')) screenshotUnavailable = true
        throw error
      }
    },
    { imageModel, projectId, turnId: recordedTurn.id, visionModel },
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
  // Track Firecrawl credits and calculate scrape cost from the configured rate.
  let scrapeCredits = 0
  let scrapeCalls = 0
  // Accumulate image-generation count and OpenRouter-reported cost.
  let imageCostUsd = 0
  let imageCount = 0
  // Accumulate prompt-attachment/screenshot vision OCR metadata.
  let visionCalls = 0
  let visionCostUsd = 0
  let visionImages = 0
  // Capture provider-reported LLM cost from raw response chunks when present.
  let llmProviderCostUsd = 0
  // Accumulate bundled image-OCR OpenRouter-reported cost inside scrape cost.
  let scrapeOcrCalls = 0
  let scrapeOcrCostUsd = 0
  let scrapeOcrImages = 0
  // Stop repeated blind edit attempts after MAX_EDIT_FAILURES consecutive failures.
  let editFailures = 0
  let fatalRunError: null | string = null
  // Optional per-run USD cap (config.agentMaxCostUsd). 0/undefined disables it.
  // Checked after each LLM/image/vision cost accrual; aborts the run if exceeded.
  const costCapUsd = config.agentMaxCostUsd
  const checkCostCap = (): boolean => {
    if (costCapUsd <= 0) return false
    const runCostUsd = llmProviderCostUsd + imageCostUsd + visionCostUsd
    if (runCostUsd < costCapUsd) return false
    fatalRunError = `Run exceeded the $${costCapUsd.toFixed(2)} cost cap.`
    emit('error', { message: fatalRunError })
    controller.abort()
    return true
  }

  // Hoisted above the try so the post-stream cost/stats accounting in
  // `finally` can read them even when the loop threw (graceful stop /
  // mid-stream error), not only on the clean/break path.
  let agentStep = 0
  let stream: Awaited<ReturnType<typeof agent.stream>> | undefined
  let streamError: string | undefined

  try {
    // Persist the streaming turn (prompt + isStreaming) before any work so a
    // crash during attachment analysis or the agent run still leaves the prompt
    // and any later checkpoints recoverable on disk.
    const attachmentAnalysis = await analyzePromptAttachments({
      attachments,
      emit,
      nextToolSeq: () => ++toolCallSeq,
      projectId,
      recordedTurn,
      signal: controller.signal,
      visionModel,
    })
    // Surface the final attachment metadata (incl. OCR analysisText) so the
    // client-messages replay can reconstruct turn.attachments on reload. The
    // browser ignores this unknown event; only server-side hydration reads it.
    if (recordedTurn.attachments && recordedTurn.attachments.length > 0) {
      emit('attachments_update', { attachments: recordedTurn.attachments })
    }
    if (attachmentAnalysis.images > 0) {
      visionImages += attachmentAnalysis.images
      visionCostUsd += attachmentAnalysis.cost
      if (attachmentAnalysis.ok) visionCalls += 1
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
            messages: stripReasoning(messages) as ProjectRawMessage[],
            step: agentStep,
            ts: new Date().toISOString(),
            turnId: recordedTurn.id,
          } satisfies AgentMessageEntry)
        }
      },
    })
    agentMessageList = stream.messageList

    streamLoop: for await (const chunk of stream.fullStream) {
      switch (chunk.type) {
        case 'error': {
          const message =
            chunk.payload.error instanceof Error
              ? chunk.payload.error.message
              : String(chunk.payload.error)
          emit('error', { message })
          break
        }
        case 'raw': {
          const providerCost = providerReportedCost(chunk.payload)
          if (providerCost > 0) llmProviderCostUsd = providerCost
          if (checkCostCap()) break streamLoop
          break
        }
        case 'reasoning-delta': {
          emit('thinking', { delta: chunk.payload.text })
          break
        }
        case 'text-delta': {
          emit('text', { delta: chunk.payload.text })
          break
        }
        case 'tool-call': {
          const args = asToolArgs(chunk.payload.args)
          const display = startToolCallDisplay(
            callDisplay,
            completedCallIds,
            ++toolCallSeq,
            chunk.payload.toolCallId,
            chunk.payload.toolName,
            args,
          )
          callAction.set(chunk.payload.toolCallId, display.action)

          const toolPayload: RecordedToolPayload = {
            action: display.action,
            detail: display.detail,
            id: display.id,
            providerId: chunk.payload.toolCallId,
            state: 'running',
            tool: chunk.payload.toolName,
          }
          emit('tool_call', toolPayload)
          break
        }
        case 'tool-call-input-streaming-start': {
          const display = startToolCallDisplay(
            callDisplay,
            completedCallIds,
            ++toolCallSeq,
            chunk.payload.toolCallId,
            chunk.payload.toolName,
          )

          const toolPayload: RecordedToolPayload = {
            action: display.action,
            detail: display.detail,
            id: display.id,
            providerId: chunk.payload.toolCallId,
            state: 'start',
            tool: chunk.payload.toolName,
          }
          emit('tool_call', toolPayload)
          break
        }
        case 'tool-error': {
          const args = asToolArgs(chunk.payload.args)
          const display = getToolCallDisplay(
            callDisplay,
            chunk.payload.toolCallId,
            chunk.payload.toolName,
            args,
            ++toolCallSeq,
          )
          const action =
            callAction.get(chunk.payload.toolCallId) ?? display.action
          const toolPayload: RecordedToolPayload = {
            action,
            detail: display.detail,
            id: display.id,
            providerId: chunk.payload.toolCallId,
            result: summarizeToolError(chunk.payload.error),
            state: 'error',
            tool: chunk.payload.toolName,
          }
          emit('tool_call', toolPayload)
          completedCallIds.add(chunk.payload.toolCallId)
          if (chunk.payload.toolName === 'edit') {
            editFailures += 1
            if (editFailures >= MAX_EDIT_FAILURES) {
              fatalRunError = REPEATED_EDIT_FAILURE_MESSAGE
              emit('error', { message: fatalRunError })
              controller.abort()
              break streamLoop
            }
          }
          break
        }
        case 'tool-result': {
          const isError =
            chunk.payload.isError === true ||
            toolResultIndicatesFailure(
              chunk.payload.toolName,
              chunk.payload.result,
            )
          const args = asToolArgs(chunk.payload.args)
          const display = getToolCallDisplay(
            callDisplay,
            chunk.payload.toolCallId,
            chunk.payload.toolName,
            args,
            ++toolCallSeq,
          )
          const action =
            callAction.get(chunk.payload.toolCallId) ?? display.action
          const result = summarizeToolResult(
            chunk.payload.toolName,
            chunk.payload.result,
            isError,
          )
          const toolPayload: RecordedToolPayload = {
            action,
            detail: display.detail,
            id: display.id,
            providerId: chunk.payload.toolCallId,
            result,
            state: isError ? 'error' : 'done',
            tool: chunk.payload.toolName,
          }
          emit('tool_call', toolPayload)
          completedCallIds.add(chunk.payload.toolCallId)
          if (chunk.payload.toolName === 'edit') {
            if (isError) {
              editFailures += 1
              if (editFailures >= MAX_EDIT_FAILURES) {
                fatalRunError = REPEATED_EDIT_FAILURE_MESSAGE
                emit('error', { message: fatalRunError })
                controller.abort()
                break streamLoop
              }
            } else {
              const nextHtml = store.get()
              if (nextHtml !== lastHtmlUpdate) {
                htmlUpdateSequence += 1
                const htmlUpdate = createHtmlUpdatePayload({
                  html: nextHtml,
                  previousHtml: lastHtmlUpdate,
                  projectId,
                  sequence: htmlUpdateSequence,
                })
                emit('html_update', htmlUpdate)
                lastHtmlUpdate = nextHtml
              }
            }
          }
          // The agent's `edit` tool writes the project file directly (the file
          // is the source of truth). The UI morphs `html_update` events after
          // successful changed edits instead of pulling HTML on every edit-done.
          // Track Firecrawl usage and bundled OpenRouter OCR metadata from successful scrape calls.
          if (chunk.payload.toolName === 'scrape' && !isError) {
            const result = chunk.payload.result as {
              creditsUsed?: number
              imageOcr?: {
                cost?: number
                imagesAnalyzed?: number
                ok?: boolean
                usage?: null | {
                  cachedTokens?: number
                  completionTokens?: number
                  promptTokens?: number
                }
              }
            }
            scrapeCalls += 1
            if (typeof result.creditsUsed === 'number') {
              scrapeCredits += result.creditsUsed
            }
            const imageOcr = result.imageOcr
            if (imageOcr?.ok && (imageOcr.imagesAnalyzed ?? 0) > 0) {
              scrapeOcrCalls += 1
              scrapeOcrImages += imageOcr.imagesAnalyzed ?? 0
              scrapeOcrCostUsd += visionCost(
                {
                  cachedTokens: imageOcr.usage?.cachedTokens,
                  completionTokens: imageOcr.usage?.completionTokens,
                  promptTokens: imageOcr.usage?.promptTokens,
                },
                imageOcr.cost,
              )
            }
          }
          // Accumulate image-generation cost from successful generate_image calls.
          if (chunk.payload.toolName === 'generate_image' && !isError) {
            const result = chunk.payload.result as {
              cost?: number
              imagesGenerated?: number
              url?: null | string
            }
            if (typeof result.imagesGenerated === 'number') {
              imageCount += result.imagesGenerated
              imageCostUsd += imageGenCost(result.imagesGenerated, result.cost)
              if (checkCostCap()) break streamLoop
            }
            // Persist generated image bytes to the project folder at
            // generation time so they are durable even if a later edit fails
            // (the edit path otherwise never runs persistProjectImagesSync).
            const imgUrl = typeof result.url === 'string' ? result.url : null
            const match = imgUrl?.match(/\/images\/(img-\d+)(\.[a-z0-9]+)?$/i)
            if (match) {
              persistGeneratedImage(projectId, match[1]!, match[2] ?? '')
            }
          }
          // Accumulate screenshot OCR usage from successful screenshot calls.
          if (chunk.payload.toolName === 'screenshot' && !isError) {
            const result = chunk.payload.result as {
              imageOcr?: {
                cost?: number
                imagesAnalyzed?: number
                ok?: boolean
                usage?: null | {
                  cachedTokens?: number
                  completionTokens?: number
                  promptTokens?: number
                }
              }
            }
            const imageOcr = result.imageOcr
            if (imageOcr?.ok && (imageOcr.imagesAnalyzed ?? 0) > 0) {
              visionCalls += 1
              visionImages += imageOcr.imagesAnalyzed ?? 0
              visionCostUsd += visionCost(
                {
                  cachedTokens: imageOcr.usage?.cachedTokens,
                  completionTokens: imageOcr.usage?.completionTokens,
                  promptTokens: imageOcr.usage?.promptTokens,
                },
                imageOcr.cost,
              )
              if (checkCostCap()) break streamLoop
            }
          }
          break
        }
        default:
          // start, step-start, step-finish, text-start/end, reasoning-start/end,
          // tool-call-delta, tool-call-input-streaming-end, finish — not
          // surfaced individually in the custom protocol.
          break
      }
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
      // Cost/stats accounting runs here (not in the try body) so it executes
      // even when the stream loop THREW (graceful stop / mid-stream error), not
      // only on the clean/break path. `stream.usage`/`finishReason` may reject
      // on an aborted stream; fall back so accounting (image/scrape/vision cost
      // accumulated during the run, plus provider-reported LLM cost) records.
      // A stream setup failure still emits zero-token stats plus any costs that
      // were already accumulated before `agent.stream` rejected.
      let usage: {
        cachedInputTokens?: number
        inputTokens?: number
        outputTokens?: number
        raw?: unknown
        reasoningTokens?: number
        totalTokens?: number
      } = {}
      let finishReason = 'stop'
      if (streamError && !controller.signal.aborted) finishReason = 'error'
      if (stream) {
        try {
          usage = await stream.usage
          finishReason = (await stream.finishReason) ?? finishReason
        } catch {
          // Retain the stop/error fallback while preserving costs accumulated by
          // image, scrape, vision, or raw provider chunks before termination.
        }
      }
      const llmCost = calculateLlmCost(textModel, {
        cachedInputTokens: usage.cachedInputTokens,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        raw: llmProviderCostUsd > 0 ? llmProviderCostUsd : usage.raw,
        reasoningTokens: usage.reasoningTokens,
        totalTokens: usage.totalTokens,
      })
      const firecrawlCostUsd = firecrawlCost(
        scrapeCredits,
        config.firecrawl.creditUsd,
      )
      const scrapeCostUsd = firecrawlCostUsd + scrapeOcrCostUsd
      const totalCost = llmCost + scrapeCostUsd + imageCostUsd + visionCostUsd

      const statsPayload: RecordedStatsPayload = {
        cost: totalCost,
        costBreakdown: {
          image: {
            cost: imageCostUsd,
            count: imageCount,
          },
          llm: llmCost,
          scrape: {
            calls: scrapeCalls,
            cost: scrapeCostUsd,
            credits: scrapeCredits,
            firecrawlCost: firecrawlCostUsd,
            ocrCalls: scrapeOcrCalls,
            ocrCost: scrapeOcrCostUsd,
            ocrImages: scrapeOcrImages,
          },
          total: totalCost,
          vision: {
            calls: visionCalls,
            cost: visionCostUsd,
            images: visionImages,
          },
        },
        durationMs: Date.now() - startedAt,
        finishReason,
        model: textModel,
        usage: {
          cachedInputTokens: usage.cachedInputTokens,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          reasoningTokens: usage.reasoningTokens,
          totalTokens: usage.totalTokens,
        },
      }
      emit('stats', statsPayload)

      // Final agent-message snapshot at run end (the last per-step snapshot via
      // onStepFinish may not fire for every stream shape, so this guarantees the
      // turn's Mastra messages are captured for replay). `dir: 'step'` with the
      // next step number; replay takes the last snapshot per turn.
      const finalAgentMessages = stream?.messageList?.get?.response?.db?.()
      if (finalAgentMessages && finalAgentMessages.length > 0) {
        agentStep += 1
        void appendAgentMessages(projectId, {
          dir: 'step',
          messages: stripReasoning(finalAgentMessages) as ProjectRawMessage[],
          step: agentStep,
          ts: new Date().toISOString(),
          turnId: recordedTurn.id,
        })
      }

      // Terminal error: any controller-aborted non-fatal run is `stopped`, even
      // when Mastra ends its iterator cleanly instead of throwing. This keeps a
      // user stop from falling through to the unrelated empty-draft error. A
      // fatal run error was already emitted during the loop.
      if (!fatalRunError) {
        const terminalError = controller.signal.aborted
          ? 'stopped'
          : streamError
        if (terminalError) {
          emit('error', { message: terminalError })
        } else if (!project.hasHtml && htmlUpdateSequence === 0) {
          emit('error', { message: NO_GENERATED_HTML_MESSAGE })
        }
      }
    } finally {
      emit('done', {})
    }
  }
}

async function analyzePromptAttachments({
  attachments,
  emit,
  nextToolSeq,
  projectId,
  recordedTurn,
  signal,
  visionModel,
}: {
  attachments: AgentAttachmentInput[]
  emit: (event: string, payload: unknown) => void
  nextToolSeq: () => number
  projectId: string
  recordedTurn: ProjectMessageTurn
  signal: AbortSignal
  visionModel: string
}): Promise<AttachmentAnalysis> {
  if (attachments.length === 0) {
    return { contextBlock: '', cost: 0, images: 0, ok: true }
  }

  const id = `tool-${nextToolSeq()}-analyze_image`
  const action = 'Analyze attached visual reference'
  const detail = compactLines([
    action,
    ...attachments.map((attachment) => attachment.name),
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
    const result = await ocrImageInputs(
      attachments.map((attachment) => ({
        dataUrl: attachment.dataUrl,
        sourceLabel: attachment.name,
      })),
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
        images,
        ok: false,
      }
    }

    const donePayload: RecordedToolPayload = {
      action,
      detail,
      id,
      result: `Analyzed ${images} attached image${images === 1 ? '' : 's'}`,
      state: 'done',
      tool: 'analyze_image',
    }
    emit('tool_call', donePayload)
    return {
      contextBlock: buildAttachmentContext(attachments, result, visionModel),
      cost,
      images,
      ok: true,
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
      images: 0,
      ok: false,
    }
  }
}

function asToolArgs(value: unknown): ToolArgs {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as ToolArgs
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function buildAgentMessages(
  history: ProjectMessageTurn[],
  rawByTurnId: ReadonlyMap<string, MastraDBMessage[]>,
  currentPrompt: string,
): AgentReplayMessage[] {
  return [
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
    { content: currentPrompt, role: 'user' },
  ]
}

function buildAttachmentContext(
  attachments: AgentAttachmentInput[],
  result: ImageOcrResult,
  visionModel: string,
): string {
  const imageList = attachments
    .map((attachment, index) => {
      const base = `${index + 1}. ${attachment.name} (${attachment.mediaType}, ${attachment.size} bytes)`
      if (attachment.kind !== 'element') return base
      return [
        base,
        `Selected element HTML:\n${truncateAttachmentHtml(attachment.html)}`,
      ].join('\n')
    })
    .join('\n')
  return [
    `Attached image OCR/visual transcript from OpenRouter \`${visionModel}\`:`,
    imageList,
    '',
    result.text || 'No text returned.',
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
    (attachment, index) => [
      `${index + 1}. ${attachment.name} (${attachment.mediaType}, ${attachment.size} bytes)`,
      attachment.kind === 'element' && attachment.html
        ? `Selected element HTML:\n${truncateAttachmentHtml(attachment.html)}`
        : null,
      attachment.analysisText
        ? `OCR/visual transcript: ${attachment.analysisText}`
        : null,
    ],
  )

  return compactLines([
    turn.prompt,
    attachmentLines.length > 0 ? 'Attachments:' : null,
    ...attachmentLines,
  ])
}

/**
 * Defensive accessor for the response portion of a Mastra stream's message
 * list — the real assistant text, tool calls, and tool results generated this
 * turn. Returns `undefined` when the accessor is absent (e.g. the test fake
 * stream) or throws, so persistence is best-effort and never breaks a run.
 */
function compactLines(lines: Array<null | string | undefined>): null | string {
  const compacted = lines
    .map((line) => line?.trim())
    .filter((line): line is string => !!line)
  return compacted.length > 0 ? compacted.join('\n') : null
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
): ProjectMessageTurn {
  return {
    ...(attachments.length > 0 ? { attachments } : {}),
    htmlSwaps: 0,
    id: `turn-${randomUUID()}`,
    isStreaming: true,
    model,
    parts: [],
    prompt,
  }
}

function defaultToolAction(tool: string, args: ToolArgs): string | undefined {
  if (tool === 'edit') {
    // `edit` carries one top-level `action` label (a single hashline diff
    // per call); the SSE stream emits exactly one block per edit call.
    return stringValue(args.action)
  }

  if (tool === 'screenshot') {
    const selector = stringValue(args.selector)
    const viewportSize = stringValue(args.viewportSize)
    if (selector && viewportSize) {
      return `Capture ${selector} at ${viewportSize} viewport`
    }
    if (selector) return `Capture ${selector}`
    if (viewportSize) return `Capture screenshot at ${viewportSize} viewport`
    return 'Capture screenshot'
  }

  // `skill`/`skill_read` schemas have no `action` arg; derive one from their
  // other args so the UI reason column is populated instead of blank.
  if (tool === 'skill') {
    const name = stringValue(args.name)
    return name ? `Load skill: ${name}` : 'Load skill'
  }
  if (tool === 'skill_read') {
    const skillName = stringValue(args.skillName)
    const path = stringValue(args.path)
    if (skillName && path) return `Read ${skillName} reference: ${path}`
    if (skillName) return `Read ${skillName} reference`
    if (path) return `Read reference: ${path}`
    return 'Read skill reference'
  }

  return undefined
}

function getToolCallDisplay(
  displayByProviderId: Map<string, ToolCallDisplay>,
  providerId: string,
  tool: string,
  args: ToolArgs,
  nextDisplaySeq: number,
): ToolCallDisplay {
  return (
    displayByProviderId.get(providerId) ??
    startToolCallDisplay(
      displayByProviderId,
      new Set<string>(),
      nextDisplaySeq,
      providerId,
      tool,
      args,
    )
  )
}

function hashHtml(html: string): string {
  return createHash('sha256').update(html).digest('hex')
}

function isValidEditResult(result: unknown): boolean {
  const data = asToolArgs(result)
  return booleanValue(data.ok) === true
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
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

function startToolCallDisplay(
  displayByProviderId: Map<string, ToolCallDisplay>,
  completedProviderIds: Set<string>,
  nextDisplaySeq: number,
  providerId: string,
  tool: string,
  args: ToolArgs = {},
): ToolCallDisplay {
  let display = displayByProviderId.get(providerId)

  if (!display || completedProviderIds.has(providerId)) {
    display = {
      action: null,
      detail: null,
      id: `tool-${nextDisplaySeq}-${tool}`,
      tool,
    }
    displayByProviderId.set(providerId, display)
    completedProviderIds.delete(providerId)
  }

  const action = stringValue(args.action) ?? defaultToolAction(tool, args)
  if (action) display.action = action

  const detail = summarizeToolArgs(tool, args)
  if (detail) display.detail = detail

  return display
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined
}

function stripAttachmentData({
  dataUrl: _dataUrl,
  ...metadata
}: AgentAttachmentInput): ProjectMessageAttachment {
  return metadata
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

const summarizeArgsForTool: Record<string, (args: ToolArgs) => null | string> =
  {
    edit: (args) => stringValue(args.action) ?? null,
    find: (args) =>
      compactLines([
        stringValue(args.action),
        stringValue(args.text) ? `Text: ${stringValue(args.text)}` : null,
      ]),
    generate_image: (args) => {
      const action = stringValue(args.action)
      const prompt = stringValue(args.prompt)
      const aspectRatio = stringValue(args.aspectRatio)
      return compactLines([
        action,
        prompt && prompt !== action ? prompt : null,
        aspectRatio ? `Aspect ratio: ${aspectRatio}` : null,
      ])
    },
    grep: (args) =>
      compactLines([
        stringValue(args.action),
        stringValue(args.pattern)
          ? `Pattern: ${stringValue(args.pattern)}`
          : null,
      ]),
    read: (args) => {
      const from = stringValue(args.from)
      const to = stringValue(args.to)
      const limit = numberValue(args.limit)
      return compactLines([
        stringValue(args.action),
        from || to ? `Anchors: ${from ?? 'start'}${to ? `..${to}` : ''}` : null,
        limit ? `Limit: ${limit}` : null,
      ])
    },
    scrape: (args) =>
      compactLines([stringValue(args.action), stringValue(args.url)]),
    screenshot: (args) => {
      const selector = stringValue(args.selector)
      const viewportSize = stringValue(args.viewportSize)
      return compactLines([
        stringValue(args.action),
        selector ? `Selector: ${selector}` : null,
        viewportSize ? `Viewport: ${viewportSize}` : null,
      ])
    },
    skill: (args) =>
      stringValue(args.name) ? `Skill: ${stringValue(args.name)}` : null,
    skill_read: (args) => {
      const skillName = stringValue(args.skillName)
      const path = stringValue(args.path)
      const startLine = numberValue(args.startLine)
      const endLine = numberValue(args.endLine)
      const range = startLine
        ? `:${startLine}${endLine ? `-${endLine}` : ''}`
        : ''
      return compactLines([
        skillName ? `Skill: ${skillName}` : null,
        path ? `Reference: ${path}${range}` : null,
      ])
    },
    skill_search: (args) => {
      const skillNames = stringArrayValue(args.skillNames)
      return compactLines([
        stringValue(args.query) ? `Query: ${stringValue(args.query)}` : null,
        skillNames.length > 0 ? `Skills: ${skillNames.join(', ')}` : null,
      ])
    },
  }

function summarizeFindOrGrepResult(data: ToolArgs): null | string {
  const matchCount = numberValue(data.matchCount)
  const truncated = booleanValue(data.truncatedLines)
  return typeof matchCount === 'number'
    ? `${matchCount} match${matchCount === 1 ? '' : 'es'}${truncated ? ' · truncated' : ''}`
    : null
}

function summarizeToolArgs(tool: string, args: ToolArgs): null | string {
  return summarizeArgsForTool[tool]?.(args) ?? stringValue(args.action) ?? null
}

function summarizeToolError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const data = error as Record<string, unknown>
    const message = stringValue(data.message)
    if (message) return message
    const reason = stringValue(data.reason)
    if (reason) return reason
    const errorMessage = stringValue(data.error)
    if (errorMessage) return errorMessage
    const details = asToolArgs(data.details)
    const detailMessage = stringValue(details.errorMessage)
    if (detailMessage) return detailMessage
    try {
      return JSON.stringify(data)
    } catch {
      return String(error)
    }
  }
  return 'Tool failed.'
}

const summarizeResultForTool: Record<
  string,
  (data: ToolArgs, reason: string | undefined) => null | string
> = {
  edit: (data) => {
    const bytes = numberValue(data.bytes)
    const tag = stringValue(data.tag)
    return typeof bytes === 'number'
      ? `Edited · ${bytes}B${typeof tag === 'string' ? ` · #${tag}` : ''}`
      : 'Edited'
  },
  find: summarizeFindOrGrepResult,
  generate_image: (data, reason) => {
    if (booleanValue(data.ok) === false) return reason ?? 'No image generated.'
    const count = numberValue(data.imagesGenerated)
    const url = stringValue(data.url)
    return compactLines([
      typeof count === 'number'
        ? `Generated ${count} image${count === 1 ? '' : 's'}`
        : 'Generated image',
      url,
    ])
  },
  grep: summarizeFindOrGrepResult,
  read: (data) => {
    const lines = numberValue(data.lines)
    const totalLines = numberValue(data.totalLines)
    return typeof lines === 'number'
      ? `Read ${lines} line${lines === 1 ? '' : 's'}${typeof totalLines === 'number' ? ` of ${totalLines}` : ''}`
      : null
  },
  scrape: (data) => {
    const imageOcr = asToolArgs(data.imageOcr)
    const ocrImages = numberValue(imageOcr.imagesAnalyzed)
    return [
      stringValue(data.title) ?? stringValue(data.url),
      numberValue(data.charCount) !== undefined
        ? `${numberValue(data.charCount)} chars`
        : null,
      numberValue(data.linkCount) !== undefined
        ? `${numberValue(data.linkCount)} links`
        : null,
      numberValue(data.imageCount) !== undefined
        ? `${numberValue(data.imageCount)} images`
        : null,
      ocrImages && ocrImages > 0 ? `OCR ${ocrImages} images` : null,
    ]
      .filter((part): part is string => !!part)
      .join(' · ')
  },
  screenshot: (data, reason) => {
    if (booleanValue(data.ok) === false) {
      return reason ?? 'Screenshot analysis failed.'
    }
    const imageOcr = asToolArgs(data.imageOcr)
    const ocrImages = numberValue(imageOcr.imagesAnalyzed)
    const selector = stringValue(data.selector)
    const viewportSize = stringValue(data.viewportSize)
    const width = numberValue(data.width)
    const height = numberValue(data.height)
    return compactLines([
      width && height
        ? `Captured ${width}×${height} screenshot`
        : 'Captured screenshot',
      selector ? `Selector: ${selector}` : null,
      viewportSize ? `Viewport: ${viewportSize}` : null,
      ocrImages && ocrImages > 0
        ? `OCR ${ocrImages} image${ocrImages === 1 ? '' : 's'}`
        : null,
    ])
  },
  skill: () => 'Loaded skill instructions',
  skill_read: () => 'Loaded reference content',
  skill_search: () => 'Search complete',
}

function summarizeToolResult(
  tool: string,
  result: unknown,
  isError: boolean,
): null | string {
  const data = asToolArgs(result)
  const reason = stringValue(data.reason)
  if (isError) {
    if (tool === 'edit' && !isValidEditResult(result)) {
      return reason ?? INVALID_EDIT_RESULT_MESSAGE
    }
    return reason ?? summarizeToolError(result)
  }
  return summarizeResultForTool[tool]?.(data, reason) ?? null
}

function toolResultIndicatesFailure(tool: string, result: unknown): boolean {
  const data = asToolArgs(result)
  if (tool === 'edit') return !isValidEditResult(result)
  return booleanValue(data.ok) === false
}

function truncateAttachmentHtml(html: string, maxLength = 20_000) {
  return html.length > maxLength
    ? `${html.slice(0, maxLength)}\n<!-- truncated -->`
    : html
}
