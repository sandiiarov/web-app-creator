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
  stats: RunStatsTracker
}): (chunk: StreamChunk) => 'break' | undefined {
  // Stop repeated blind edit attempts after MAX_EDIT_FAILURES consecutive failures.
  let editFailures = 0
  // Per provider toolCallId start time (epoch ms) → startedAt on running
  // payloads, durationMs on terminal ones; the client renders the timer.
  const callStartedAt = new Map<string, number>()

  return (chunk) => {
    switch (chunk.type) {
      case 'data-om-observation-end':
      case 'data-om-observation-failed':
      case 'data-om-observation-start': {
        // Observational Memory cycle events (context autocompaction) —
        // surfaced as a `memory` SSE event so the client can render a
        // compaction marker in the conversation.
        const payload = omCyclePayload(chunk)
        if (payload) emit('memory', payload)
        break
      }
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
        if (!callStartedAt.has(chunk.payload.toolCallId))
          callStartedAt.set(chunk.payload.toolCallId, Date.now())

        const toolPayload: RecordedToolPayload = {
          action: display.action,
          detail: display.detail,
          id: display.id,
          providerId: chunk.payload.toolCallId,
          startedAt: callStartedAt.get(chunk.payload.toolCallId),
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

        if (!callStartedAt.has(chunk.payload.toolCallId))
          callStartedAt.set(chunk.payload.toolCallId, Date.now())

        const toolPayload: RecordedToolPayload = {
          action: display.action,
          detail: display.detail,
          id: display.id,
          providerId: chunk.payload.toolCallId,
          startedAt: callStartedAt.get(chunk.payload.toolCallId),
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
        const errorStartedAt = callStartedAt.get(chunk.payload.toolCallId)
        const toolPayload: RecordedToolPayload = {
          action,
          detail: display.detail,
          durationMs:
            errorStartedAt !== undefined
              ? Math.max(0, Date.now() - errorStartedAt)
              : undefined,
          id: display.id,
          providerId: chunk.payload.toolCallId,
          result: summarizeToolError(chunk.payload.error),
          startedAt: errorStartedAt,
          state: 'error',
          tool: chunk.payload.toolName,
        }
        emit('tool_call', toolPayload)
        completedCallIds.add(chunk.payload.toolCallId)
        callStartedAt.delete(chunk.payload.toolCallId)
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
        const resultStartedAt = callStartedAt.get(chunk.payload.toolCallId)
        const toolPayload: RecordedToolPayload = {
          action,
          detail: display.detail,
          durationMs:
            resultStartedAt !== undefined
              ? Math.max(0, Date.now() - resultStartedAt)
              : undefined,
          id: display.id,
          ...(images.length > 0 ? { images } : {}),
          providerId: chunk.payload.toolCallId,
          result,
          startedAt: resultStartedAt,
          state: isError ? 'error' : 'done',
          tool: chunk.payload.toolName,
        }
        emit('tool_call', toolPayload)
        completedCallIds.add(chunk.payload.toolCallId)
        callStartedAt.delete(chunk.payload.toolCallId)
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
        stats.emitStats()
        if (stats.checkCostCap()) return 'break'
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

/**
 * Map an OM observation cycle chunk (`data-om-observation-start/end/failed`)
 * to the custom `memory` SSE payload. `chunk.data` is untyped on data chunks,
 * so every field is read defensively.
 */
function omCyclePayload(chunk: StreamChunk): null | Record<string, unknown> {
  const data = (chunk as { data?: Record<string, unknown> }).data
  if (!data || typeof data !== 'object') return null
  const id = typeof data.cycleId === 'string' ? data.cycleId : ''
  const operation =
    data.operationType === 'reflection' ? 'reflection' : 'observation'
  if (!id) return null
  if (chunk.type === 'data-om-observation-start') {
    return {
      id,
      operation,
      state: 'running',
      tokensObserved:
        typeof data.tokensToObserve === 'number'
          ? data.tokensToObserve
          : undefined,
    }
  }
  if (chunk.type === 'data-om-observation-end') {
    return {
      durationMs:
        typeof data.durationMs === 'number' ? data.durationMs : undefined,
      id,
      observationTokens:
        typeof data.observationTokens === 'number'
          ? data.observationTokens
          : undefined,
      operation,
      state: 'done',
      tokensObserved:
        typeof data.tokensObserved === 'number'
          ? data.tokensObserved
          : undefined,
    }
  }
  return {
    error: typeof data.error === 'string' ? data.error : 'Observation failed.',
    id,
    operation,
    state: 'error',
  }
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
