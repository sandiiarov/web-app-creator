import type { Agent } from '@mastra/core/agent'
import type { MastraDBMessage } from '@mastra/core/agent/message-list'

import type {
  AgentMessageEntry,
  Project,
  ProjectMessageTurn,
  ProjectRawMessage,
  ProjectRepository,
} from './project-store.ts'
import type {
  RecordedStatsPayload,
  RunStatsTracker,
  UsageSnapshot,
} from './run-stats.ts'

/**
 * Execution finalization + agent-message log sanitizers, extracted from
 * `route.ts`'s run body. It resolves provider usage/finishReason, snapshots
 * known cost, and writes the run-end inspection record. The application run
 * coordinator owns the canonical terminal record, status projection, legacy
 * terminal delivery, and run-slot release after this result settles.
 */

const NO_GENERATED_HTML_MESSAGE =
  'Agent finished without generating project HTML. The draft still has no content because no successful edit changed the page.'
const OMITTED_INLINE_IMAGE = '[omitted inline image bytes]'

export interface RunFinalizationResult {
  agentStep: number
  outcome: 'completed' | 'error' | 'stopped'
  reason?: string
  stats: RecordedStatsPayload
}

export class RunMetadataTimeoutError extends Error {
  readonly settlement: Promise<RecordedStatsPayload>

  constructor(settlement: Promise<RecordedStatsPayload>) {
    super('Final provider usage metadata did not settle before its deadline.')
    this.name = 'RunMetadataTimeoutError'
    this.settlement = settlement
  }
}

export async function finalizeRun({
  agentStep,
  controller,
  fatalRunError,
  htmlUpdateSequence,
  metadataTimeoutMs,
  project,
  projectId,
  recordedTurn,
  repository,
  stats,
  stream,
  streamError,
}: {
  agentStep: number
  controller: AbortController
  fatalRunError: null | string
  htmlUpdateSequence: number
  metadataTimeoutMs: number
  project: Project
  projectId: string
  recordedTurn: ProjectMessageTurn
  repository: ProjectRepository
  stats: RunStatsTracker
  stream: Awaited<ReturnType<Agent['stream']>> | undefined
  streamError: string | undefined
}): Promise<RunFinalizationResult> {
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
  let metadataTimeout: RunMetadataTimeoutError | undefined
  if (stream) {
    const metadata = await settleStreamMetadata(stream, metadataTimeoutMs)
    if (metadata.usage?.status === 'fulfilled') {
      usage = metadata.usage.value
    }
    if (
      !wasStopped &&
      metadata.finishReason?.status === 'fulfilled' &&
      metadata.finishReason.value
    ) {
      finishReason = metadata.finishReason.value
    }
    if (metadata.timedOut) {
      finishReason = 'error'
      metadataTimeout = new RunMetadataTimeoutError(
        metadata.settlement.then((settled) => {
          if (settled.usage?.status === 'fulfilled') {
            stats.usage = settled.usage.value
          }
          return stats.snapshot('error')
        }),
      )
    }
  }
  stats.usage = usage

  // Final agent-message snapshot at run end (the last per-step snapshot via
  // onStepFinish may not fire for every stream shape, so this guarantees the
  // turn's Mastra messages are captured for replay). `dir: 'step'` with the
  // next step number; replay takes the last snapshot per turn.
  const finalAgentMessages = stream?.messageList?.get?.response?.db?.()
  let nextAgentStep = agentStep
  if (finalAgentMessages && finalAgentMessages.length > 0) {
    nextAgentStep += 1
    void repository.appendAgentMessages(projectId, {
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
  if (metadataTimeout) throw metadataTimeout
  const reason = fatalRunError
    ? fatalRunError
    : controller.signal.aborted
      ? 'stopped'
      : (streamError ??
        (!project.hasHtml && htmlUpdateSequence === 0
          ? NO_GENERATED_HTML_MESSAGE
          : undefined))
  const outcome =
    controller.signal.aborted && !fatalRunError
      ? 'stopped'
      : reason
        ? 'error'
        : 'completed'
  return {
    agentStep: nextAgentStep,
    outcome,
    ...(reason ? { reason } : {}),
    stats: stats.snapshot(finishReason),
  }
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

async function settleStreamMetadata(
  stream: Awaited<ReturnType<Agent['stream']>>,
  timeoutMs: number,
) {
  let usage: PromiseSettledResult<UsageSnapshot> | undefined
  let finishReason: PromiseSettledResult<string | undefined> | undefined
  const usageSettlement = Promise.resolve(stream.usage).then(
    (value) => {
      usage = { status: 'fulfilled', value }
    },
    (reason: unknown) => {
      usage = { reason, status: 'rejected' }
    },
  )
  const finishSettlement = Promise.resolve(stream.finishReason).then(
    (value) => {
      finishReason = { status: 'fulfilled', value }
    },
    (reason: unknown) => {
      finishReason = { reason, status: 'rejected' }
    },
  )
  const bothSettled = Promise.all([usageSettlement, finishSettlement]).then(
    () => 'settled' as const,
  )
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const outcome = await Promise.race([
      bothSettled,
      new Promise<'timed-out'>((resolve) => {
        timer = setTimeout(() => resolve('timed-out'), timeoutMs)
      }),
    ])
    return {
      finishReason,
      settlement: bothSettled.then(() => ({ finishReason, usage })),
      timedOut: outcome === 'timed-out',
      usage,
    }
  } finally {
    if (timer) clearTimeout(timer)
  }
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
