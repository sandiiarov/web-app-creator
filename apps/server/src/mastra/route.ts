import type { IncomingMessage, ServerResponse } from 'node:http'

import { config } from '../config.ts'
import { createLandingPageAgent } from './agents/landing-page-agent.ts'
import { mastra } from './index.ts'
import {
  estimateCost,
  firecrawlCost,
  imageGenCost,
  visionCost,
} from './lib/cost.ts'
import {
  createProjectHtmlStore,
  getProject,
  setTitleIfUntitled,
} from './lib/project-store.ts'
import { sendSse, startSse } from './lib/sse.ts'

const MAX_STEPS = 30

interface StreamOptions {
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
 * state), html (full file after a successful edit), stats, error, done.
 */
export async function streamLandingAgent({
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

  setTitleIfUntitled(projectId, prompt)

  const startedAt = Date.now()
  const store = createProjectHtmlStore(projectId)
  const baseUrl = `http://${request.headers.host ?? `localhost:${config.port}`}`
  const agent = createLandingPageAgent(store, mastra, baseUrl, modelId)
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
  // Accumulate bundled image-OCR usage inside scrape cost.
  let scrapeOcrCalls = 0
  let scrapeOcrCostUsd = 0
  let scrapeOcrImages = 0

  try {
    const stream = await agent.stream(prompt, {
      abortSignal: controller.signal,
      maxSteps: MAX_STEPS,
      modelSettings: { maxOutputTokens: 16_384 },
    })

    for await (const chunk of stream.fullStream) {
      switch (chunk.type) {
        case 'error': {
          const message =
            chunk.payload.error instanceof Error
              ? chunk.payload.error.message
              : String(chunk.payload.error)
          sendSse(response, 'error', { message })
          break
        }
        case 'reasoning-delta': {
          sendSse(response, 'thinking', { delta: chunk.payload.text })
          break
        }
        case 'text-delta': {
          sendSse(response, 'text', { delta: chunk.payload.text })
          break
        }
        case 'tool-call': {
          const display = startToolCallDisplay(
            callDisplay,
            completedCallIds,
            ++toolCallSeq,
            chunk.payload.toolCallId,
            chunk.payload.toolName,
            asToolArgs(chunk.payload.args),
          )
          callIntent.set(chunk.payload.toolCallId, display.intent)
          sendSse(response, 'tool_call', {
            detail: display.detail,
            id: display.id,
            intent: display.intent,
            providerId: chunk.payload.toolCallId,
            state: 'running',
            tool: chunk.payload.toolName,
          })
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
          sendSse(response, 'tool_call', {
            detail: display.detail,
            id: display.id,
            intent: display.intent,
            providerId: chunk.payload.toolCallId,
            state: 'start',
            tool: chunk.payload.toolName,
          })
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
          const intent = callIntent.get(chunk.payload.toolCallId) ?? display.intent
          const result = summarizeToolResult(
            chunk.payload.toolName,
            chunk.payload.result,
            isError,
          )
          sendSse(response, 'tool_call', {
            detail: display.detail,
            id: display.id,
            intent,
            providerId: chunk.payload.toolCallId,
            result,
            state: isError ? 'error' : 'done',
            tool: chunk.payload.toolName,
          })
          completedCallIds.add(chunk.payload.toolCallId)
          // The agent's `edit` tool writes the project file directly (the file
          // is the source of truth). The UI pulls the updated HTML on edit-done,
          // so we do not push an `html` event here.
          // Accumulate Firecrawl + bundled image-OCR usage from successful scrape calls.
          if (chunk.payload.toolName === 'scrape' && !isError) {
            const result = chunk.payload.result as {
              creditsUsed?: number
              imageOcr?: {
                cost?: number
                imagesAnalyzed?: number
                ok?: boolean
                usage?:
                  | null
                  | {
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
              imageCostUsd += imageGenCost(
                result.imagesGenerated,
                result.cost,
              )
            }
          }
          break
        }
        default:
          // start, step-start, step-finish, text-start/end, reasoning-start/end,
          // tool-call-delta, tool-call-input-streaming-end, finish, raw — not
          // surfaced individually in the custom protocol.
          break
      }
    }

    const usage = await stream.usage
    const llmCost = estimateCost(modelId, {
      cachedInputTokens: usage.cachedInputTokens,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      raw: usage.raw,
      reasoningTokens: usage.reasoningTokens,
      totalTokens: usage.totalTokens,
    })
    const firecrawlCostUsd = firecrawlCost(scrapeCredits)
    const scrapeCostUsd = firecrawlCostUsd + scrapeOcrCostUsd
    const totalCost = llmCost + scrapeCostUsd + imageCostUsd

    sendSse(response, 'stats', {
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
    })
  } catch (error) {
    const aborted = controller.signal.aborted
    sendSse(response, 'error', {
      message: aborted
        ? 'stopped'
        : error instanceof Error
          ? error.message
          : 'Unknown error',
    })
  } finally {
    request.off('close', onClose)
    sendSse(response, 'done', {})
    response.end()
  }
}

function asToolArgs(value: unknown): ToolArgs {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as ToolArgs
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function compactLines(lines: Array<null | string | undefined>): null | string {
  const compacted = lines
    .map((line) => line?.trim())
    .filter((line): line is string => !!line)
  return compacted.length > 0 ? compacted.join('\n') : null
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

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
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
        stringValue(args.pattern) ? `Pattern: ${stringValue(args.pattern)}` : null,
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

function summarizeToolResult(
  tool: string,
  result: unknown,
  isError: boolean,
): null | string {
  const data = asToolArgs(result)
  const reason = stringValue(data.reason)

  if (isError) return reason ?? 'Tool failed.'

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
      if (booleanValue(data.ok) === false) return reason ?? 'No image generated.'
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
