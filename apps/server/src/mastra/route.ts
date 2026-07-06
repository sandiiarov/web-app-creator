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
  saveProjectMessageTurn,
  createProjectHtmlStore,
  getProject,
  persistGeneratedImage,
  readProjectRawMessages,
  saveProjectRawMessages,
  setTitleIfUntitled,
  updateProjectModel,
  type ProjectMessageAttachment,
  type ProjectMessageStatsPart,
  type ProjectMessageToolCallPart,
  type ProjectMessageTurn,
  type ProjectRawMessage,
} from './lib/project-store.ts'
import { createLandingAgentErrorProcessors } from './lib/retry.ts'
import { sendSse, startSse } from './lib/sse.ts'

const ATTACHMENT_OCR_PROMPT =
  'Analyze the attached image for landing-page generation. Extract all visible text exactly, then describe layout, hierarchy, colors, typography, UI components, imagery, brand cues, and any details the landing-page agent should use. If the image is a screenshot or mockup, call out sections, navigation, CTAs, spacing, and visual style.'
const MAX_EDIT_FAILURES = 10
const MAX_STEPS = 30
const REPEATED_EDIT_FAILURE_MESSAGE = `Edit failed ${MAX_EDIT_FAILURES} times in this turn. Stopping so the agent does not keep making blind edit attempts. Read/find the current project HTML and try again.`
const INVALID_EDIT_RESULT_MESSAGE =
  'Edit failed because the model did not provide a valid edits array. Retry with edit({ edits: [{ intent, from?, to?, code?, insert? }] }).'
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

type ToolArgs = Record<string, unknown>

interface ToolCallDisplay {
  detail: null | string
  id: string
  intent: null | string
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
 * Run the landing-page agent and stream the custom SSE protocol by mapping
 * Mastra `fullStream` chunks. Emits: thinking, text, tool_call (with intent +
 * terminal error/result states), stats, error, done.
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
    response.end()
    return
  }

  await updateProjectModel(projectId, textModel)
  setTitleIfUntitled(projectId, prompt)

  const recordedTurn = createRecordedTurn(
    prompt,
    textModel,
    attachments.map(stripAttachmentData),
  )
  // Serialize incremental message checkpoints so a crash mid-run still leaves a
  // recoverable streaming turn on disk. The finalized turn (same id) replaces
  // the streaming checkpoints via `saveProjectMessageTurn`'s upsert-by-id.
  let writeChain: Promise<unknown> = Promise.resolve()
  const checkpointTurn = (turn: ProjectMessageTurn = recordedTurn) => {
    writeChain = writeChain
      .then(() => saveProjectMessageTurn(projectId, turn))
      .catch((error) => {
        console.error('Failed to checkpoint project message turn', error)
      })
    return writeChain
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
        timeoutMs,
      })
      sendSse(response, 'screenshot_request', {
        projectId,
        requestId,
        selector,
        viewportSize,
      })
      try {
        return await promise
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : String(error)
        if (reason.includes('timed out')) screenshotUnavailable = true
        throw error
      }
    },
    { imageModel, visionModel },
  )
  const controller = new AbortController()

  const onClose = () => controller.abort()
  request.on('close', onClose)

  startSse(response)

  // Track per-call display state from provider toolCallId. The UI receives our
  // display id, not the raw provider id, so repeated provider ids cannot collapse
  // separate invocations into one rendered row.
  const callDisplay = new Map<string, ToolCallDisplay>()
  const completedCallIds = new Set<string>()
  // Track per-call intent from the tool-call chunk (tool-result args can be
  // absent), so we can echo it on the done/error states too.
  const callIntent = new Map<string, null | string>()
  // Fan-out: one provider `edit` call with N edits renders as N blocks. Map
  // the provider toolCallId to the per-edit sub-ids so tool-result can match.
  const editSubIds = new Map<string, string[]>()
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
  let terminalToolResult: string | undefined
  // Captured from `stream.messageList` after the run so the real assistant +
  // tool messages can be persisted for faithful history replay. Declared
  // outside `try` so the `finally` block can persist whatever was captured
  // (undefined when the stream never completed a full response).
  let rawResponseMessages: MastraDBMessage[] | undefined

  try {
    // Persist the streaming turn (prompt + isStreaming) before any work so a
    // crash during attachment analysis or the agent run still leaves the prompt
    // and any later checkpoints recoverable on disk.
    await checkpointTurn()
    const attachmentAnalysis = await analyzePromptAttachments({
      attachments,
      nextToolSeq: () => ++toolCallSeq,
      recordedTurn,
      response,
      visionModel,
    })
    if (attachmentAnalysis.images > 0) {
      visionImages += attachmentAnalysis.images
      visionCostUsd += attachmentAnalysis.cost
      if (attachmentAnalysis.ok) visionCalls += 1
    }
    checkpointTurn()

    const agentPrompt = attachmentAnalysis.contextBlock
      ? `${prompt}\n\n${attachmentAnalysis.contextBlock}`
      : prompt
    // Replay the real prior conversation (raw Mastra messages) when available
    // so the model sees previous tool calls and tool results, not a prose
    // paraphrase. `readProjectRawMessages` returns [] on a fresh project.
    const rawByTurnId = new Map(
      (await readProjectRawMessages(projectId)).map((entry) => [
        entry.turnId,
        entry.messages as MastraDBMessage[],
      ]),
    )
    const agentMessages = buildAgentMessages(
      project.messages,
      rawByTurnId,
      agentPrompt,
    )

    const stream = await agent.stream(agentMessages, {
      abortSignal: controller.signal,
      errorProcessors: createLandingAgentErrorProcessors(
        config.agentRetry,
        (event) => {
          sendSse(response, 'retry', event)
          checkpointTurn()
        },
      ),
      includeRawChunks: true,
      maxProcessorRetries: config.agentRetry.streamErrorMaxRetries,
      maxSteps: MAX_STEPS,
      modelSettings: {
        maxOutputTokens: 16_384,
        maxRetries: config.agentRetry.modelMaxRetries,
      },
    })

    streamLoop: for await (const chunk of stream.fullStream) {
      switch (chunk.type) {
        case 'error': {
          const message =
            chunk.payload.error instanceof Error
              ? chunk.payload.error.message
              : String(chunk.payload.error)
          recordTurnError(recordedTurn, message)
          sendSse(response, 'error', { message })
          checkpointTurn()
          break
        }
        case 'raw': {
          const providerCost = providerReportedCost(chunk.payload)
          if (providerCost > 0) llmProviderCostUsd = providerCost
          break
        }
        case 'reasoning-delta': {
          recordTextDelta(recordedTurn, 'thinking', chunk.payload.text)
          sendSse(response, 'thinking', { delta: chunk.payload.text })
          break
        }
        case 'text-delta': {
          recordTextDelta(recordedTurn, 'text', chunk.payload.text)
          sendSse(response, 'text', { delta: chunk.payload.text })
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
          callIntent.set(chunk.payload.toolCallId, display.intent)

          // Edit fan-out: a batched edit call (N >= 2 edits) renders as N
          // running blocks, each carrying its own intent, instead of one.
          const editIntents =
            chunk.payload.toolName === 'edit'
              ? editIntentsFromArgs(args)
              : null
          if (editIntents) {
            const subIds = editIntents.map((_, index) =>
              editSubId(toolCallSeq, index),
            )
            editSubIds.set(chunk.payload.toolCallId, subIds)
            for (const [index, intent] of editIntents.entries()) {
              const toolPayload: RecordedToolPayload = {
                id: subIds[index]!,
                intent,
                providerId: chunk.payload.toolCallId,
                state: 'running',
                tool: chunk.payload.toolName,
              }
              recordToolCall(recordedTurn, toolPayload)
              sendSse(response, 'tool_call', toolPayload)
            }
            break
          }

          const toolPayload: RecordedToolPayload = {
            detail: display.detail,
            id: display.id,
            intent: display.intent,
            providerId: chunk.payload.toolCallId,
            state: 'running',
            tool: chunk.payload.toolName,
          }
          recordToolCall(recordedTurn, toolPayload)
          sendSse(response, 'tool_call', toolPayload)
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
            detail: display.detail,
            id: display.id,
            intent: display.intent,
            providerId: chunk.payload.toolCallId,
            state: 'start',
            tool: chunk.payload.toolName,
          }
          recordToolCall(recordedTurn, toolPayload)
          sendSse(response, 'tool_call', toolPayload)
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
          const intent =
            callIntent.get(chunk.payload.toolCallId) ?? display.intent
          const toolPayload: RecordedToolPayload = {
            detail: display.detail,
            id: display.id,
            intent,
            providerId: chunk.payload.toolCallId,
            result: summarizeToolError(chunk.payload.error),
            state: 'error',
            tool: chunk.payload.toolName,
          }
          recordToolCall(recordedTurn, toolPayload)
          sendSse(response, 'tool_call', toolPayload)
          completedCallIds.add(chunk.payload.toolCallId)
          if (chunk.payload.toolName === 'edit') {
            editFailures += 1
            if (editFailures >= MAX_EDIT_FAILURES) {
              fatalRunError = REPEATED_EDIT_FAILURE_MESSAGE
              recordTurnError(recordedTurn, fatalRunError)
              sendSse(response, 'error', { message: fatalRunError })
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
          const intent =
            callIntent.get(chunk.payload.toolCallId) ?? display.intent
          const result = summarizeToolResult(
            chunk.payload.toolName,
            chunk.payload.result,
            isError,
          )
          // Edit fan-out result: emit one terminal block per edit, each with
          // its own intent and per-edit diff slice (from result.edits[i]). On
          // a whole-call error every edit block gets the shared error reason.
          const fanOutSubIds = editSubIds.get(chunk.payload.toolCallId)
          if (fanOutSubIds && chunk.payload.toolName === 'edit') {
            const perEditResults = (chunk.payload.result as { edits?: { changedLines: number; changedText: string }[] })
              .edits
            const editArgsIntents = editIntentsFromArgs(args) ?? []
            for (const [index, subId] of fanOutSubIds.entries()) {
              const perEdit = perEditResults?.[index]
              const perResult = isError
                ? result
                : perEdit
                  ? `Changed ${perEdit.changedLines} line${perEdit.changedLines === 1 ? '' : 's'}`
                  : result
              const toolPayload: RecordedToolPayload = {
                id: subId!,
                intent: editArgsIntents[index] ?? null,
                providerId: chunk.payload.toolCallId,
                result: perResult,
                state: isError ? 'error' : 'done',
                tool: chunk.payload.toolName,
              }
              recordToolCall(recordedTurn, toolPayload)
              sendSse(response, 'tool_call', toolPayload)
            }
            editSubIds.delete(chunk.payload.toolCallId)
            completedCallIds.add(chunk.payload.toolCallId)
            if (chunk.payload.toolName === 'edit') {
              if (isError) {
                editFailures += 1
                if (editFailures >= MAX_EDIT_FAILURES) {
                  fatalRunError = REPEATED_EDIT_FAILURE_MESSAGE
                  recordTurnError(recordedTurn, fatalRunError)
                  sendSse(response, 'error', { message: fatalRunError })
                  controller.abort()
                  break streamLoop
                }
              } else {
                recordedTurn.htmlSwaps += 1
                const nextHtml = store.get()
                if (nextHtml !== lastHtmlUpdate) {
                  htmlUpdateSequence += 1
                  const htmlUpdate = createHtmlUpdatePayload({
                    html: nextHtml,
                    previousHtml: lastHtmlUpdate,
                    projectId,
                    sequence: htmlUpdateSequence,
                  })
                  sendSse(response, 'html_update', htmlUpdate)
                  lastHtmlUpdate = nextHtml
                  checkpointTurn()
                }
              }
            }
            break
          }
          const toolPayload: RecordedToolPayload = {
            detail: display.detail,
            id: display.id,
            intent,
            providerId: chunk.payload.toolCallId,
            result,
            state: isError ? 'error' : 'done',
            tool: chunk.payload.toolName,
          }
          recordToolCall(recordedTurn, toolPayload)
          sendSse(response, 'tool_call', toolPayload)
          completedCallIds.add(chunk.payload.toolCallId)
          if (chunk.payload.toolName === 'edit') {
            if (isError) {
              editFailures += 1
              if (editFailures >= MAX_EDIT_FAILURES) {
                fatalRunError = REPEATED_EDIT_FAILURE_MESSAGE
                recordTurnError(recordedTurn, fatalRunError)
                sendSse(response, 'error', { message: fatalRunError })
                controller.abort()
                break streamLoop
              }
            } else {
              recordedTurn.htmlSwaps += 1
              const nextHtml = store.get()
              if (nextHtml !== lastHtmlUpdate) {
                htmlUpdateSequence += 1
                const htmlUpdate = createHtmlUpdatePayload({
                  html: nextHtml,
                  previousHtml: lastHtmlUpdate,
                  projectId,
                  sequence: htmlUpdateSequence,
                })
                sendSse(response, 'html_update', htmlUpdate)
                lastHtmlUpdate = nextHtml
                checkpointTurn()
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
            }
            // Persist generated image bytes to the project folder at
            // generation time so they are durable even if a later edit fails
            // (the edit path otherwise never runs persistProjectImagesSync).
            const imgUrl =
              typeof result.url === 'string' ? result.url : null
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

    // Always account for cost and capture raw response messages, even on a
    // fatal/aborted run, so the user sees what a run actually spent and the
    // partial response is recoverable for history replay. `stream.usage`/
    // `finishReason` may reject on an aborted stream; fall back so accounting
    // (image/scrape/vision cost accumulated during the loop) still records.
    let usage: {
      cachedInputTokens?: number
      inputTokens?: number
      outputTokens?: number
      raw?: unknown
      reasoningTokens?: number
      totalTokens?: number
    } = {}
    let finishReason = 'stop'
    try {
      usage = await stream.usage
      finishReason = (await stream.finishReason) ?? 'stop'
    } catch {
      finishReason = 'stop'
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
    recordStats(recordedTurn, statsPayload)
    sendSse(response, 'stats', statsPayload)

    rawResponseMessages = captureResponseMessages(stream)

    // The empty-draft guard is a real completion error, not an accounting
    // concern, so it only fires when the run was not already fatal.
    if (!fatalRunError && !project.hasHtml && htmlUpdateSequence === 0) {
      recordTurnError(recordedTurn, NO_GENERATED_HTML_MESSAGE)
      sendSse(response, 'error', { message: NO_GENERATED_HTML_MESSAGE })
    }
  } catch (error) {
    const aborted = controller.signal.aborted
    if (!fatalRunError) {
      const message = aborted
        ? 'stopped'
        : error instanceof Error
          ? error.message
          : 'Unknown error'
      if (aborted) {
        terminalToolResult = 'Stopped.'
      } else {
        recordTurnError(recordedTurn, message)
      }
      sendSse(response, 'error', { message })
    }
  } finally {
    request.off('close', onClose)
    await checkpointTurn(
      finalizeRecordedTurn(recordedTurn, terminalToolResult),
    )
    if (rawResponseMessages && rawResponseMessages.length > 0) {
      try {
        await saveProjectRawMessages(
          projectId,
          recordedTurn.id,
          stripReplayNoise(rawResponseMessages) as ProjectRawMessage[],
        )
      } catch (error) {
        console.error('Failed to persist raw mastra messages', error)
      }
    }
    sendSse(response, 'done', {})
    response.end()
  }
}

async function analyzePromptAttachments({
  attachments,
  nextToolSeq,
  recordedTurn,
  response,
  visionModel,
}: {
  attachments: AgentAttachmentInput[]
  nextToolSeq: () => number
  recordedTurn: ProjectMessageTurn
  response: ServerResponse
  visionModel: string
}): Promise<AttachmentAnalysis> {
  if (attachments.length === 0) {
    return { contextBlock: '', cost: 0, images: 0, ok: true }
  }

  const id = `tool-${nextToolSeq()}-analyze_image`
  const intent = 'Analyze attached visual reference'
  const detail = compactLines([
    intent,
    ...attachments.map((attachment) => attachment.name),
  ])
  const runningPayload: RecordedToolPayload = {
    detail,
    id,
    intent,
    state: 'running',
    tool: 'analyze_image',
  }
  recordToolCall(recordedTurn, runningPayload)
  sendSse(response, 'tool_call', runningPayload)

  try {
    const result = await ocrImageInputs(
      attachments.map((attachment) => ({
        dataUrl: attachment.dataUrl,
        sourceLabel: attachment.name,
      })),
      ATTACHMENT_OCR_PROMPT,
      visionModel,
    )
    const cost = visionCost(result.usage ?? {}, result.cost)
    const images = result.imagesAnalyzed

    recordAttachmentAnalysis(recordedTurn, result.text)

    if (!result.ok) {
      const reason = result.reason ?? 'Image analysis failed.'
      const errorPayload: RecordedToolPayload = {
        detail,
        id,
        intent,
        result: reason,
        state: 'error',
        tool: 'analyze_image',
      }
      recordToolCall(recordedTurn, errorPayload)
      sendSse(response, 'tool_call', errorPayload)
      return {
        contextBlock: `Attached image analysis failed: ${reason}`,
        cost,
        images,
        ok: false,
      }
    }

    const donePayload: RecordedToolPayload = {
      detail,
      id,
      intent,
      result: `Analyzed ${images} attached image${images === 1 ? '' : 's'}`,
      state: 'done',
      tool: 'analyze_image',
    }
    recordToolCall(recordedTurn, donePayload)
    sendSse(response, 'tool_call', donePayload)
    return {
      contextBlock: buildAttachmentContext(attachments, result, visionModel),
      cost,
      images,
      ok: true,
    }
  } catch (error) {
    const reason = summarizeToolError(error)
    const errorPayload: RecordedToolPayload = {
      detail,
      id,
      intent,
      result: reason,
      state: 'error',
      tool: 'analyze_image',
    }
    recordToolCall(recordedTurn, errorPayload)
    sendSse(response, 'tool_call', errorPayload)
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
function captureResponseMessages(stream: {
  messageList?: {
    get?: {
      response?: {
        db?: () => MastraDBMessage[]
      }
    }
  }
}): MastraDBMessage[] | undefined {
  try {
    const messages = stream.messageList?.get?.response?.db?.()
    return messages && messages.length > 0 ? messages : undefined
  } catch {
    return undefined
  }
}

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

function defaultToolIntent(tool: string, args: ToolArgs): string | undefined {
  if (tool === 'edit') {
    // `edit` has no call-level intent; the model puts one on each edit
    // object. For a single-edit call use that intent directly. A multi-edit
    // batch is fanned out by `editIntentsFromArgs` (each edit gets its own
    // block), so the first edit's intent here is only a fallback for the
    // call-level display record.
    const edits = args.edits
    if (Array.isArray(edits) && edits.length >= 1) {
      const first = edits[0]
      if (first && typeof first === 'object' && !Array.isArray(first)) {
        const intent = stringValue((first as { intent?: unknown }).intent)
        if (intent) return intent
      }
    }
    return undefined
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

  // `skill`/`skill_read` schemas have no `intent` arg; derive one from their
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

/**
 * Extract the per-edit intents from an `edit` tool-call args. Returns null
 * when the args are not the expected `{ edits: [{ intent, ... }] }` shape or
 * the batch has 0/1 edits (single-block fallback handles those).
 */
function editIntentsFromArgs(args: ToolArgs): null | string[] {
  const edits = args.edits
  if (!Array.isArray(edits) || edits.length < 2) return null
  const intents: string[] = []
  for (const edit of edits) {
    if (!edit || typeof edit !== 'object' || Array.isArray(edit)) return null
    const intent = (edit as { intent?: unknown }).intent
    if (typeof intent !== 'string' || intent.length === 0) return null
    intents.push(intent)
  }
  return intents
}

/**
 * Build stable per-edit sub-ids for a fanned-out `edit` call. The seq anchors
 * the provider call; the index distinguishes each edit within it.
 */
function editSubId(baseSeq: number, index: number) {
  return `tool-${baseSeq}-edit-${index + 1}`
}

function finalizeRecordedTurn(
  turn: ProjectMessageTurn,
  terminalToolResult?: string,
): ProjectMessageTurn {
  return terminalizeRecordedTools(
    { ...turn, isStreaming: false },
    terminalToolResult,
  )
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
  return (
    booleanValue(data.ok) === true &&
    numberValue(data.changedLines) !== undefined
  )
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

function recordStats(turn: ProjectMessageTurn, stats: RecordedStatsPayload) {
  turn.parts.push({ ...stats, type: 'stats' })
}

function recordTextDelta(
  turn: ProjectMessageTurn,
  type: 'text' | 'thinking',
  delta: string,
) {
  if (!delta) return

  const last = turn.parts[turn.parts.length - 1]
  if (last?.type === type) {
    last.text += delta
    return
  }

  turn.parts.push({
    id: `${turn.id}-${type}-${turn.parts.length + 1}`,
    text: delta,
    type,
  })
}

function recordToolCall(
  turn: ProjectMessageTurn,
  payload: RecordedToolPayload,
) {
  const next: ProjectMessageToolCallPart = {
    id: payload.id,
    intent: payload.intent,
    state: payload.state,
    tool: payload.tool,
    type: 'tool_call',
  }
  if (payload.detail !== undefined) next.detail = payload.detail
  if (payload.providerId !== undefined) next.providerId = payload.providerId
  if (payload.result !== undefined) next.result = payload.result

  const existing = turn.parts.findIndex(
    (part) => part.type === 'tool_call' && part.id === payload.id,
  )

  if (existing === -1) {
    turn.parts.push(next)
    return
  }

  turn.parts[existing] = {
    ...(turn.parts[existing] as ProjectMessageToolCallPart),
    ...next,
  }
}

function recordTurnError(turn: ProjectMessageTurn, message: string) {
  if (message === 'stopped') return
  turn.error = message
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
      detail: null,
      id: `tool-${nextDisplaySeq}-${tool}`,
      intent: null,
      tool,
    }
    displayByProviderId.set(providerId, display)
    completedProviderIds.delete(providerId)
  }

  const intent = stringValue(args.intent) ?? defaultToolIntent(tool, args)
  if (intent) display.intent = intent

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

/**
 * Strip parts that bloat history replay without aiding the next turn's
 * decisions. `reasoning` is the model's private chain-of-thought — every
 * decision it informed is already captured by the `tool-invocation`
 * calls/results and `text` we keep, so replaying the reasoning only inflates
 * the prompt (observed +73K input tokens on a 2-line turn-2 edit) without
 * improving fidelity. Returns a deep clone so the live stream's message list
 * is never mutated.
 */
function stripReplayNoise(messages: MastraDBMessage[]): MastraDBMessage[] {
  return messages.map((message) => {
    const parts = message.content?.parts
    if (!Array.isArray(parts)) return message
    const kept = parts.filter((part) => part?.type !== 'reasoning')
    if (kept.length === parts.length) return message
    return {
      ...message,
      content: { ...message.content, parts: kept },
    }
  })
}

function summarizeToolArgs(tool: string, args: ToolArgs): null | string {
  const intent = stringValue(args.intent)

  switch (tool) {
    case 'edit':
      return intent ?? null
    case 'find':
      return compactLines([
        intent,
        stringValue(args.text) ? `Text: ${stringValue(args.text)}` : null,
      ])
    case 'generate_image': {
      const prompt = stringValue(args.prompt)
      const aspectRatio = stringValue(args.aspectRatio)
      return compactLines([
        intent,
        prompt && prompt !== intent ? prompt : null,
        aspectRatio ? `Aspect ratio: ${aspectRatio}` : null,
      ])
    }
    case 'grep':
      return compactLines([
        intent,
        stringValue(args.pattern)
          ? `Pattern: ${stringValue(args.pattern)}`
          : null,
      ])
    case 'read': {
      const offset = numberValue(args.offset)
      const limit = numberValue(args.limit)
      return compactLines([
        intent,
        offset || limit
          ? `Lines: ${offset ?? 1}${limit ? ` + ${limit}` : ''}`
          : null,
      ])
    }
    case 'scrape':
      return compactLines([intent, stringValue(args.url)])
    case 'screenshot': {
      const selector = stringValue(args.selector)
      const viewportSize = stringValue(args.viewportSize)
      return compactLines([
        intent,
        selector ? `Selector: ${selector}` : null,
        viewportSize ? `Viewport: ${viewportSize}` : null,
      ])
    }
    case 'skill':
      return stringValue(args.name) ? `Skill: ${stringValue(args.name)}` : null
    case 'skill_read': {
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
    }
    case 'skill_search': {
      const skillNames = stringArrayValue(args.skillNames)
      return compactLines([
        stringValue(args.query) ? `Query: ${stringValue(args.query)}` : null,
        skillNames.length > 0 ? `Skills: ${skillNames.join(', ')}` : null,
      ])
    }
    default:
      return intent ?? null
  }
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

  switch (tool) {
    case 'edit': {
      const changedLines = numberValue(data.changedLines)
      return typeof changedLines === 'number'
        ? `Changed ${changedLines} line${changedLines === 1 ? '' : 's'}`
        : null
    }
    case 'find':
    case 'grep': {
      const matchCount = numberValue(data.matchCount)
      const truncated = booleanValue(data.truncatedLines)
      return typeof matchCount === 'number'
        ? `${matchCount} match${matchCount === 1 ? '' : 'es'}${truncated ? ' · truncated' : ''}`
        : null
    }
    case 'generate_image': {
      const count = numberValue(data.imagesGenerated)
      const url = stringValue(data.url)
      if (booleanValue(data.ok) === false)
        return reason ?? 'No image generated.'
      return compactLines([
        typeof count === 'number'
          ? `Generated ${count} image${count === 1 ? '' : 's'}`
          : 'Generated image',
        url,
      ])
    }
    case 'read': {
      const lines = numberValue(data.lines)
      const totalLines = numberValue(data.totalLines)
      return typeof lines === 'number'
        ? `Read ${lines} line${lines === 1 ? '' : 's'}${typeof totalLines === 'number' ? ` of ${totalLines}` : ''}`
        : null
    }
    case 'scrape': {
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
    }
    case 'screenshot': {
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
    }
    case 'skill':
      return 'Loaded skill instructions'
    case 'skill_read':
      return 'Loaded reference content'
    case 'skill_search':
      return 'Search complete'
    default:
      return null
  }
}

function terminalizeRecordedTools(
  turn: ProjectMessageTurn,
  result = 'Tool did not return a result before the response completed.',
): ProjectMessageTurn {
  return {
    ...turn,
    parts: turn.parts.map((part) => {
      if (
        part.type !== 'tool_call' ||
        (part.state !== 'running' && part.state !== 'start')
      ) {
        return part
      }
      return {
        ...part,
        result: part.result ?? result,
        state: 'error',
      }
    }),
  }
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
