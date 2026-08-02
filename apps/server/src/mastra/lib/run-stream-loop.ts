import type { Agent } from '@mastra/core/agent'

import { providerReportedCost } from './cost.ts'
import type { ProjectMessageToolCallPart } from './project-store.ts'
import type { RunStatsTracker } from './run-stats.ts'
import {
  asToolArgs,
  defaultToolAction,
  stringValue,
  summarizeToolArgs,
  summarizeToolError,
  summarizeToolResult,
  toolCallImages,
  toolResultIndicatesFailure,
  type ToolArgs,
  type ToolCallDisplay,
} from './tool-display.ts'

/**
 * The Mastra `fullStream` chunk pump extracted from `route.ts`'s
 * `runAgentStream`. One handler per run: maps every chunk to the custom SSE
 * protocol (`error` / `thinking` / `text` / `tool_call` / `html_update`
 * passthroughs), tracks per-call display state from provider toolCallIds,
 * accumulates tool costs via the run-stats tracker, and breaks the loop on
 * the edit-failure circuit breaker or a tripped cost cap.
 */

export type StreamChunk =
  Awaited<ReturnType<Agent['stream']>>['fullStream'] extends AsyncIterable<
    infer C
  >
    ? C
    : never

const MAX_EDIT_FAILURES = 10
const REPEATED_EDIT_FAILURE_MESSAGE = `Edit failed ${MAX_EDIT_FAILURES} times in this turn. Stopping so the agent does not keep making blind edit attempts. Read/find the current project HTML and try again.`

type RecordedToolPayload = Omit<ProjectMessageToolCallPart, 'type'>

export function createStreamChunkHandler({
  baseUrl,
  callAction,
  callDisplay,
  completedCallIds,
  emit,
  nextToolSeq,
  onEditSuccess,
  onFatal,
  persistImage,
  stats,
}: {
  baseUrl: string
  callAction: Map<string, null | string>
  callDisplay: Map<string, ToolCallDisplay>
  completedCallIds: Set<string>
  emit: (event: string, payload: unknown) => void
  nextToolSeq: () => number
  /** Successful `edit` with (possibly) changed HTML — route emits html_update. */
  onEditSuccess: () => void
  /** Fatal run error — emitted once, aborts the run. */
  onFatal: (message: string) => void
  persistImage: (imageId: string, ext: string) => void
  stats: RunStatsTracker
}): (chunk: StreamChunk) => 'break' | undefined {
  // Stop repeated blind edit attempts after MAX_EDIT_FAILURES consecutive failures.
  let editFailures = 0

  return (chunk) => {
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
        stats.recordRawProviderCost(providerReportedCost(chunk.payload))
        if (stats.checkCostCap()) return 'break'
        break
      }
      case 'reasoning-delta': {
        emit('thinking', { delta: chunk.payload.text })
        break
      }
      case 'step-finish': {
        stats.recordStepUsage(chunk.payload)
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
          nextToolSeq(),
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
          nextToolSeq(),
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
          nextToolSeq(),
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
        stats.emitStats()
        if (chunk.payload.toolName === 'edit') {
          editFailures += 1
          if (editFailures >= MAX_EDIT_FAILURES) {
            onFatal(REPEATED_EDIT_FAILURE_MESSAGE)
            return 'break'
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
          nextToolSeq(),
        )
        const action =
          callAction.get(chunk.payload.toolCallId) ?? display.action
        const result = summarizeToolResult(
          chunk.payload.toolName,
          chunk.payload.result,
          isError,
        )
        const images = toolCallImages(
          chunk.payload.toolName,
          chunk.payload.result,
          baseUrl,
        )
        const toolPayload: RecordedToolPayload = {
          action,
          detail: display.detail,
          id: display.id,
          ...(images.length > 0 ? { images } : {}),
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
              onFatal(REPEATED_EDIT_FAILURE_MESSAGE)
              return 'break'
            }
          } else {
            // The agent's `edit` tool writes the project file directly (the
            // file is the source of truth). The UI morphs `html_update`
            // events after successful changed edits instead of pulling HTML
            // on every edit-done.
            onEditSuccess()
          }
        }
        // Track Firecrawl usage and bundled OpenRouter OCR metadata from successful scrape calls.
        if (chunk.payload.toolName === 'scrape' && !isError) {
          stats.recordScrapeResult(
            chunk.payload.result as {
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
            },
          )
        }
        let checkToolCostCap = false
        // Accumulate image-generation cost from successful generate_image calls.
        if (chunk.payload.toolName === 'generate_image' && !isError) {
          const result = chunk.payload.result as {
            cost?: number
            imagesGenerated?: number
            url?: null | string
          }
          if (stats.recordGenerateImage(result)) {
            checkToolCostCap = true
          }
          // Persist generated image bytes to the project folder at
          // generation time so they are durable even if a later edit fails
          // (the edit path otherwise never runs persistProjectImagesSync).
          const imgUrl = typeof result.url === 'string' ? result.url : null
          const match = imgUrl?.match(/\/images\/(img-\d+)(\.[a-z0-9]+)?$/i)
          if (match) {
            persistImage(match[1]!, match[2] ?? '')
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
          if (stats.recordScreenshotOcr(result)) {
            checkToolCostCap = true
          }
        }
        stats.emitStats()
        if (checkToolCostCap && stats.checkCostCap()) return 'break'
        break
      }
      default:
        // start, step-start, text-start/end, reasoning-start/end,
        // tool-call-delta, tool-call-input-streaming-end, finish — not
        // surfaced individually in the custom protocol.
        break
    }
    return undefined
  }
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
