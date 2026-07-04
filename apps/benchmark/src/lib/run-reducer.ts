import type {
  CostBreakdown,
  TokenUsage,
  ToolCallState,
} from '@workspace/prompt-panel'

import type { Mistake, RunResult, RunStats, ToolCallSummary } from './types'

/**
 * SSE wire-event payloads. Mirrors `apps/server/src/mastra/route.ts` and the
 * client's `landing-agent.ts`. The benchmark consumes the same stream the
 * editor does; it just folds it into a result instead of a conversation.
 */
export interface SseEvent {
  data: unknown
  event: string
}

interface HtmlUpdatePayload {
  html: string
  projectId: string
  sequence: number
}

interface RetryPayload {
  attempt: number
  delayMs: number
  issue: string
  maxAttempts: number
  reason: string
}

interface ScreenshotRequestPayload {
  projectId: string
  requestId: string
}

interface StatsPayload {
  cost: number
  costBreakdown?: CostBreakdown
  durationMs: number
  finishReason: string
  model: string
  usage: TokenUsage
}

interface ToolCallPayload {
  detail?: null | string
  id: string
  intent?: null | string
  result?: null | string
  state: ToolCallState
  tool: string
}

/**
 * Fold one SSE event into the run result. Pure: returns a new RunResult.
 *
 * The `screenshot_request` event is NOT consumed here — the hook answers it
 * out-of-band (the reducer has no network access by design).
 */
export function applySseEvent(
  result: RunResult,
  { data, event }: SseEvent,
): {
  result: RunResult
  screenshotRequest?: { projectId: string; requestId: string }
} {
  const payload = asObject(data) ?? {}
  let screenshotRequest: undefined | { projectId: string; requestId: string }

  switch (event) {
    case 'done': {
      return {
        result: {
          ...result,
          finishedAt: Date.now(),
          status: result.status === 'running' ? 'done' : result.status,
        },
      }
    }
    case 'error': {
      const message = asString(payload.message) ?? 'Unknown error'
      if (message === 'stopped') {
        return {
          result: { ...result, finishedAt: Date.now(), status: 'stopped' },
        }
      }
      return {
        result: addMistake(
          {
            ...result,
            error: message,
            finishedAt: Date.now(),
            status: 'error',
          },
          { at: Date.now(), kind: 'turn_error', message },
        ),
      }
    }
    case 'html_update': {
      const update = payload as unknown as HtmlUpdatePayload
      if (typeof update.html === 'string') {
        return { result: { ...result, html: update.html } }
      }
      return { result }
    }
    case 'retry': {
      const retry = payload as unknown as RetryPayload
      const message = `${retry.reason ?? 'Retry'}: ${retry.issue ?? 'unknown'} (${retry.attempt}/${retry.maxAttempts})`
      return {
        result: addMistake(
          { ...result, retryCount: result.retryCount + 1 },
          { at: Date.now(), kind: 'retry', message },
        ),
      }
    }
    case 'screenshot_request': {
      const req = payload as unknown as ScreenshotRequestPayload
      if (typeof req.requestId === 'string') {
        screenshotRequest = {
          projectId: asString(req.projectId) ?? result.projectId,
          requestId: req.requestId,
        }
      }
      return { result, screenshotRequest }
    }
    case 'stats': {
      const stats = payload as unknown as StatsPayload
      const nextStats: RunStats = {
        cost: asNumber(stats.cost),
        costBreakdown: stats.costBreakdown,
        durationMs: asNumber(stats.durationMs),
        finishReason: asString(stats.finishReason),
        model: asString(stats.model),
        usage: stats.usage,
      }
      return { result: { ...result, stats: nextStats } }
    }
    case 'text': {
      const delta = asString(payload.delta) ?? ''
      return { result: { ...result, text: result.text + delta } }
    }
    case 'tool_call': {
      const call = payload as unknown as ToolCallPayload
      if (typeof call.id !== 'string' || typeof call.tool !== 'string') {
        return { result }
      }
      const toolCalls = mergeToolCall(result.toolCalls, call)
      const editCount =
        call.tool === 'edit' && call.state === 'done'
          ? result.editCount + 1
          : result.editCount
      let next = { ...result, editCount, toolCalls }

      // Edit failures are mistakes the report should surface.
      if (call.tool === 'edit' && call.state === 'error') {
        next = addMistake(next, {
          at: Date.now(),
          kind: 'tool_error',
          message: call.result ?? 'Edit failed',
          tool: call.tool,
        })
      }
      // Any tool ending in error counts as a mistake (non-edit too).
      if (call.state === 'error' && call.tool !== 'edit') {
        next = addMistake(next, {
          at: Date.now(),
          kind: 'tool_error',
          message: call.result ?? `${call.tool} failed`,
          tool: call.tool,
        })
      }
      return { result: next }
    }
    default:
      return { result }
  }
}

function addMistake(result: RunResult, mistake: Mistake): RunResult {
  return { ...result, mistakes: [...result.mistakes, mistake] }
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function asObject(value: unknown): null | Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function mergeToolCall(
  existing: ToolCallSummary[],
  call: ToolCallPayload,
): ToolCallSummary[] {
  const index = existing.findIndex((entry) => entry.id === call.id)
  const merged: ToolCallSummary = {
    detail: call.detail,
    id: call.id,
    intent: call.intent ?? null,
    result: call.result,
    state: call.state,
    tool: call.tool,
  }
  if (index === -1) return [...existing, merged]
  const next = [...existing]
  next[index] = {
    ...next[index]!,
    ...merged,
    detail: merged.detail ?? next[index]!.detail,
    intent: merged.intent ?? next[index]!.intent,
    result: merged.result ?? next[index]!.result,
  }
  return next
}
