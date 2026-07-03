import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

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
import {
  BASETEN_VISION_MODEL,
  ocrImageInputs,
  type ImageOcrResult,
} from './lib/image-ocr.ts'
import {
  appendProjectMessageTurn,
  createProjectHtmlStore,
  getProject,
  setTitleIfUntitled,
  updateProjectModel,
  type ProjectMessageAttachment,
  type ProjectMessageStatsPart,
  type ProjectMessageToolCallPart,
  type ProjectMessageTurn,
} from './lib/project-store.ts'
import { createLandingAgentErrorProcessors } from './lib/retry.ts'
import { sendSse, startSse } from './lib/sse.ts'

const ATTACHMENT_OCR_PROMPT =
  'Analyze the attached image for landing-page generation. Extract all visible text exactly, then describe layout, hierarchy, colors, typography, UI components, imagery, brand cues, and any details the landing-page agent should use. If the image is a screenshot or mockup, call out sections, navigation, CTAs, spacing, and visual style.'
const MAX_EDIT_FAILURES = 10
const MAX_STEPS = 30
const READ_BEFORE_RETRY_MESSAGE =
  'Edit failed because oldText did not match the current project HTML. Read or grep /index.html before retrying; do not guess whitespace.'
const REPEATED_EDIT_FAILURE_MESSAGE = `Edit failed ${MAX_EDIT_FAILURES} times in this turn. Stopping so the agent does not keep making blind edit attempts. Read/grep the current /index.html and try again.`

export interface AgentImageAttachmentInput extends ProjectMessageAttachment {
  dataUrl: string
}

type AgentConversationMessage =
  | { content: string; role: 'assistant' }
  | { content: string; role: 'user' }

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
  attachments?: AgentImageAttachmentInput[]
  modelId: string
  projectId: string
  prompt: string
  request: IncomingMessage
  response: ServerResponse
}

type ToolArgs = Record<string, unknown>

interface ToolCallDisplay {
  detail: null | string
  id: string
  intent: null | string
  tool: string
}

export function resolveModelId(model?: string): string {
  const requested = model ?? config.baseten.defaultModel
  // Allow the model dropdown to send either the bare id or the baseten/ prefix.
  return requested.startsWith('baseten/')
    ? requested.slice('baseten/'.length)
    : requested
}

/**
 * Run the landing-page agent and stream the custom SSE protocol by mapping
 * Mastra `fullStream` chunks. Emits: thinking, text, tool_call (with intent +
 * terminal error/result states), stats, error, done.
 */
export async function streamLandingAgent({
  attachments = [],
  modelId,
  projectId,
  prompt,
  request,
  response,
}: StreamOptions) {
  const project = await getProject(projectId)
  if (!project) {
    startSse(response, 404)
    sendSse(response, 'error', { message: 'Project not found' })
    sendSse(response, 'done', {})
    response.end()
    return
  }

  await updateProjectModel(projectId, modelId)
  setTitleIfUntitled(projectId, prompt)

  const recordedTurn = createRecordedTurn(
    prompt,
    modelId,
    attachments.map(stripAttachmentData),
  )
  const startedAt = Date.now()
  const store = createProjectHtmlStore(projectId)
  let lastHtmlUpdate = store.get()
  let htmlUpdateSequence = 0
  const baseUrl = `http://${request.headers.host ?? `localhost:${config.port}`}`
  const agent = createLandingPageAgent(
    store,
    mastra,
    baseUrl,
    modelId,
    async ({ height, intent, timeoutMs, width }) => {
      const { promise, requestId } = createPendingBrowserScreenshot({
        timeoutMs,
      })
      sendSse(response, 'screenshot_request', {
        height,
        intent,
        projectId,
        requestId,
        width,
      })
      return await promise
    },
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
  let toolCallSeq = 0
  // Accumulate Firecrawl credits/cost across scrape tool calls in this run.
  let scrapeCredits = 0
  let scrapeCalls = 0
  // Accumulate image-generation count/cost across generate_image calls.
  let imageCostUsd = 0
  let imageCount = 0
  // Accumulate prompt-attachment/screenshot vision OCR usage.
  let visionCalls = 0
  let visionCostUsd = 0
  let visionImages = 0
  // Capture provider-reported LLM cost from raw response chunks when present.
  let llmProviderCostUsd = 0
  // Accumulate bundled image-OCR usage inside scrape cost.
  let scrapeOcrCalls = 0
  let scrapeOcrCostUsd = 0
  let scrapeOcrImages = 0
  // Prevent repeated blind edit attempts after exact-text failures.
  let editFailures = 0
  let editRequiresInspection = false
  let fatalRunError: null | string = null
  let terminalToolResult: string | undefined

  try {
    const attachmentAnalysis = await analyzePromptAttachments({
      attachments,
      nextToolSeq: () => ++toolCallSeq,
      recordedTurn,
      response,
    })
    if (attachmentAnalysis.images > 0) {
      visionImages += attachmentAnalysis.images
      visionCostUsd += attachmentAnalysis.cost
      if (attachmentAnalysis.ok) visionCalls += 1
    }

    const agentPrompt = attachmentAnalysis.contextBlock
      ? `${prompt}\n\n${attachmentAnalysis.contextBlock}`
      : prompt
    const agentMessages = buildAgentMessages(project.messages, agentPrompt)

    const stream = await agent.stream(agentMessages, {
      abortSignal: controller.signal,
      errorProcessors: createLandingAgentErrorProcessors(
        config.agentRetry,
        (event) => sendSse(response, 'retry', event),
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

          if (chunk.payload.toolName === 'edit' && editRequiresInspection) {
            const toolPayload: RecordedToolPayload = {
              detail: display.detail,
              id: display.id,
              intent: display.intent,
              providerId: chunk.payload.toolCallId,
              result: READ_BEFORE_RETRY_MESSAGE,
              state: 'error',
              tool: chunk.payload.toolName,
            }
            recordToolCall(recordedTurn, toolPayload)
            completedCallIds.add(chunk.payload.toolCallId)
            fatalRunError = READ_BEFORE_RETRY_MESSAGE
            recordTurnError(recordedTurn, fatalRunError)
            sendSse(response, 'tool_call', toolPayload)
            sendSse(response, 'error', { message: fatalRunError })
            controller.abort()
            break streamLoop
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

          if (chunk.payload.toolName === 'edit' && editRequiresInspection) {
            const toolPayload: RecordedToolPayload = {
              detail: display.detail,
              id: display.id,
              intent: display.intent,
              providerId: chunk.payload.toolCallId,
              result: READ_BEFORE_RETRY_MESSAGE,
              state: 'error',
              tool: chunk.payload.toolName,
            }
            recordToolCall(recordedTurn, toolPayload)
            completedCallIds.add(chunk.payload.toolCallId)
            fatalRunError = READ_BEFORE_RETRY_MESSAGE
            recordTurnError(recordedTurn, fatalRunError)
            sendSse(response, 'tool_call', toolPayload)
            sendSse(response, 'error', { message: fatalRunError })
            controller.abort()
            break streamLoop
          }

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
            editRequiresInspection = true
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
          const isError = chunk.payload.isError === true
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
          if (
            (chunk.payload.toolName === 'read' ||
              chunk.payload.toolName === 'grep') &&
            !isError
          ) {
            editRequiresInspection = false
          }
          if (chunk.payload.toolName === 'edit') {
            if (isError) {
              editFailures += 1
              editRequiresInspection = true
              if (editFailures >= MAX_EDIT_FAILURES) {
                fatalRunError = REPEATED_EDIT_FAILURE_MESSAGE
                recordTurnError(recordedTurn, fatalRunError)
                sendSse(response, 'error', { message: fatalRunError })
                controller.abort()
                break streamLoop
              }
            } else {
              editRequiresInspection = false
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
              }
            }
          }
          // The agent's `edit` tool writes the project file directly (the file
          // is the source of truth). The UI morphs `html_update` events after
          // successful changed edits instead of pulling HTML on every edit-done.
          // Accumulate Firecrawl + bundled image-OCR usage from successful scrape calls.
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
            }
            if (typeof result.imagesGenerated === 'number') {
              imageCount += result.imagesGenerated
              imageCostUsd += imageGenCost(result.imagesGenerated, result.cost)
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

    if (!fatalRunError) {
      const usage = await stream.usage
      const llmCost = calculateLlmCost(modelId, {
        cachedInputTokens: usage.cachedInputTokens,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        raw: llmProviderCostUsd > 0 ? llmProviderCostUsd : usage.raw,
        reasoningTokens: usage.reasoningTokens,
        totalTokens: usage.totalTokens,
      })
      const firecrawlCostUsd = firecrawlCost(scrapeCredits)
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
        finishReason: (await stream.finishReason) ?? 'stop',
        model: modelId,
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
    try {
      await appendProjectMessageTurn(
        projectId,
        finalizeRecordedTurn(recordedTurn, terminalToolResult),
      )
    } catch (error) {
      console.error('Failed to persist project message history', error)
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
}: {
  attachments: AgentImageAttachmentInput[]
  nextToolSeq: () => number
  recordedTurn: ProjectMessageTurn
  response: ServerResponse
}): Promise<AttachmentAnalysis> {
  if (attachments.length === 0) {
    return { contextBlock: '', cost: 0, images: 0, ok: true }
  }

  const id = `tool-${nextToolSeq()}-analyze_image`
  const intent = 'Analyze attached image reference'
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
      contextBlock: buildAttachmentContext(attachments, result),
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
  currentPrompt: string,
): AgentConversationMessage[] {
  return [
    ...history.flatMap((turn) => {
      const messages: AgentConversationMessage[] = []
      const userContent = buildHistoryUserContent(turn)
      if (userContent) messages.push({ content: userContent, role: 'user' })
      const assistantContent = buildHistoryAssistantContent(turn)
      if (assistantContent) {
        messages.push({ content: assistantContent, role: 'assistant' })
      }
      return messages
    }),
    { content: currentPrompt, role: 'user' },
  ]
}

function buildAttachmentContext(
  attachments: AgentImageAttachmentInput[],
  result: ImageOcrResult,
): string {
  const imageList = attachments
    .map(
      (attachment, index) =>
        `${index + 1}. ${attachment.name} (${attachment.mediaType}, ${attachment.size} bytes)`,
    )
    .join('\n')
  return [
    `Attached image OCR/visual transcript from Baseten \`${BASETEN_VISION_MODEL}\`:`,
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

  const intent = stringValue(args.intent)
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
}: AgentImageAttachmentInput): ProjectMessageAttachment {
  return metadata
}

function summarizeToolArgs(tool: string, args: ToolArgs): null | string {
  const intent = stringValue(args.intent)

  switch (tool) {
    case 'edit':
      return intent ?? null
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
      const width = numberValue(args.width)
      const height = numberValue(args.height)
      return compactLines([
        intent,
        width || height ? `Viewport: ${width ?? 1440}×${height ?? 900}` : null,
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

  if (isError) return reason ?? summarizeToolError(result)

  switch (tool) {
    case 'edit': {
      const changedLines = numberValue(data.changedLines)
      return typeof changedLines === 'number'
        ? `Changed ${changedLines} line${changedLines === 1 ? '' : 's'}`
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
    case 'grep': {
      const matchCount = numberValue(data.matchCount)
      const truncated = booleanValue(data.truncatedLines)
      return typeof matchCount === 'number'
        ? `${matchCount} match${matchCount === 1 ? '' : 'es'}${truncated ? ' · truncated' : ''}`
        : null
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
      const width = numberValue(data.width)
      const height = numberValue(data.height)
      return compactLines([
        width && height
          ? `Captured ${width}×${height} screenshot`
          : 'Captured screenshot',
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
