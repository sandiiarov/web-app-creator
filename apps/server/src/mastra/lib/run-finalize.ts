import type { Agent } from '@mastra/core/agent'
import type { MastraDBMessage } from '@mastra/core/agent/message-list'

import {
  appendAgentMessages,
  setRunStatusSync,
  type AgentMessageEntry,
  type Project,
  type ProjectMessageTurn,
  type ProjectRawMessage,
  type RunStatus,
} from './project-store.ts'
import type { RunStatsTracker, UsageSnapshot } from './run-stats.ts'

/**
 * Terminal run finalization + agent-message log sanitizers, extracted from
 * `route.ts`'s `runAgentStream`. Finalization runs for EVERY outcome
 * (success, stream throw, abort, fatal): it resolves the terminal
 * usage/finishReason with fallbacks, emits the final stats snapshot, writes
 * the run-end agent-message snapshot, emits the terminal error (or the
 * empty-draft error), and persists the terminal run-lifecycle status.
 * `flushProjectLogs` + `releaseRun` intentionally stay in `route.ts` —
 * flush-before-release ordering is the run registry's completion signal.
 */

const NO_GENERATED_HTML_MESSAGE =
  'Agent finished without generating project HTML. The draft still has no content because no successful edit changed the page.'
const OMITTED_INLINE_IMAGE = '[omitted inline image bytes]'

export async function finalizeRun({
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
}: {
  agentStep: number
  controller: AbortController
  emit: (event: string, payload: unknown) => void
  fatalRunError: null | string
  htmlUpdateSequence: number
  project: Project
  projectId: string
  recordedTurn: ProjectMessageTurn
  stats: RunStatsTracker
  stream: Awaited<ReturnType<Agent['stream']>> | undefined
  streamError: string | undefined
}): Promise<number> {
  // Cost/stats accounting runs here (not in the try body) so it executes
  // even when the stream loop THREW (graceful stop / mid-stream error), not
  // only on the clean/break path. `stream.usage`/`finishReason` may reject
  // on an aborted stream; fall back so accounting (image/scrape/vision cost
  // accumulated during the run, plus provider-reported LLM cost) records.
  // A stream setup failure still emits zero-token stats plus any costs that
  // were already accumulated before `agent.stream` rejected.
  let usage: UsageSnapshot = stats.usage
  const wasStopped = controller.signal.aborted && !fatalRunError
  let finishReason = wasStopped ? 'stopped' : 'stop'
  if (streamError && !controller.signal.aborted) finishReason = 'error'
  if (stream) {
    try {
      usage = await stream.usage
      const resolvedFinishReason = await stream.finishReason
      if (!wasStopped && resolvedFinishReason) {
        finishReason = resolvedFinishReason
      }
    } catch {
      // Retain the stop/error fallback while preserving costs accumulated by
      // image, scrape, vision, or raw provider chunks before termination.
    }
  }
  stats.usage = usage
  stats.emitStats(finishReason)

  // Final agent-message snapshot at run end (the last per-step snapshot via
  // onStepFinish may not fire for every stream shape, so this guarantees the
  // turn's Mastra messages are captured for replay). `dir: 'step'` with the
  // next step number; replay takes the last snapshot per turn.
  const finalAgentMessages = stream?.messageList?.get?.response?.db?.()
  let nextAgentStep = agentStep
  if (finalAgentMessages && finalAgentMessages.length > 0) {
    nextAgentStep += 1
    void appendAgentMessages(projectId, {
      dir: 'step',
      messages: sanitizeAgentMessages(
        finalAgentMessages,
      ) as ProjectRawMessage[],
      step: nextAgentStep,
      ts: new Date().toISOString(),
      turnId: recordedTurn.id,
    } satisfies AgentMessageEntry)
  }

  // Terminal error: any controller-aborted non-fatal run is `stopped`, even
  // when Mastra ends its iterator cleanly instead of throwing. This keeps a
  // user stop from falling through to the unrelated empty-draft error. A
  // fatal run error was already emitted during the loop.
  if (!fatalRunError) {
    const terminalError = controller.signal.aborted ? 'stopped' : streamError
    if (terminalError) {
      emit('error', { message: terminalError })
    } else if (!project.hasHtml && htmlUpdateSequence === 0) {
      emit('error', { message: NO_GENERATED_HTML_MESSAGE })
    }
  }
  // Persist terminal run-lifecycle status so the project list + editor
  // views reflect completion/stop/error (drives the list SSE badge + the
  // editor subscribe `state` snapshot). `idle` = cleanly finished, ready
  // for the next run.
  const terminalStatus: RunStatus = fatalRunError
    ? 'error'
    : controller.signal.aborted
      ? 'stopped'
      : streamError
        ? 'error'
        : 'idle'
  setRunStatusSync(projectId, {
    error:
      fatalRunError ??
      (controller.signal.aborted ? null : (streamError ?? null)),
    finishedAt: new Date().toISOString(),
    status: terminalStatus,
  })
  return nextAgentStep
}

/** Sanitize Mastra messages before persisting to agent-messages.jsonl:
 *  strip reasoning parts + inline image bytes. */
export function sanitizeAgentMessages(
  messages: MastraDBMessage[],
): MastraDBMessage[] {
  return stripReasoning(messages).map(
    (message) => stripInlineImageData(message) as MastraDBMessage,
  )
}

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
