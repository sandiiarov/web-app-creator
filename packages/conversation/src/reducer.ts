import type {
  ClientEvent,
  ConversationPart,
  ConversationTurn,
} from './types.ts'

const DEFAULT_TOOL_RESULT =
  'Tool did not return a result before the response completed.'

type StreamTail = Extract<ConversationPart, { type: 'text' | 'thinking' }>

/**
 * Apply one outbound client event to a turn, returning a NEW turn (immutable).
 * This is the single source of truth for how an SSE event mutates a turn's
 * structure — used both by the server's hydration fold (`replayClientEvents`)
 * and by the client's live SSE stream.
 *
 * `retry`, `html_update`, and `screenshot_request` are intentionally NOT
 * handled here: they have no turn-structure effect (`html_update`/`screenshot_request`
 * are client-side side-effects; `retry` is a live-only display part the server
 * skips on reload — see `reducer.test.ts`).
 */
export function applyEventToTurn<T extends ConversationTurn>(
  turn: T,
  event: ClientEvent,
): T {
  const type = typeof event.event === 'string' ? event.event : ''
  const data = (event.payload ?? {}) as Record<string, unknown>
  const now = eventNow(event)

  switch (type) {
    case 'attachments_update': {
      if (!Array.isArray(data.attachments)) return turn
      return { ...turn, attachments: data.attachments } as T
    }
    case 'done': {
      return {
        ...turn,
        durationMs:
          turn.durationMs ??
          (turn.startedAt !== undefined
            ? Math.max(0, now - turn.startedAt)
            : undefined),
        isStreaming: false,
        parts: terminalizeParts(
          closeStreamTail(turn.parts, now),
          undefined,
          now,
        ),
      } as T
    }
    case 'error': {
      const message = typeof data.message === 'string' ? data.message : ''
      if (!message) return turn
      const durationMs =
        turn.durationMs ??
        (turn.startedAt !== undefined
          ? Math.max(0, now - turn.startedAt)
          : undefined)
      if (message === 'stopped') {
        return {
          ...turn,
          durationMs,
          parts: terminalizeParts(
            closeStreamTail(turn.parts, now),
            'Stopped.',
            now,
          ),
          stopped: true,
        } as T
      }
      return {
        ...turn,
        durationMs,
        error: message,
        parts: terminalizeParts(closeStreamTail(turn.parts, now), message, now),
      } as T
    }
    case 'memory': {
      // OM compaction marker — upsert by cycle id so start/end/failed events
      // update the same rendered row.
      const id = typeof data.id === 'string' ? data.id : ''
      if (!id) return turn
      const index = turn.parts.findIndex(
        (part) => part.type === 'memory' && part.id === id,
      )
      const prev =
        index === -1
          ? undefined
          : (turn.parts[index] as Extract<ConversationPart, { type: 'memory' }>)
      const state = data.state
      const startedAt =
        typeof data.startedAt === 'number'
          ? data.startedAt
          : (prev?.startedAt ?? (state === 'running' ? now : undefined))
      const durationMs =
        typeof data.durationMs === 'number'
          ? data.durationMs
          : (prev?.durationMs ??
            ((state === 'done' || state === 'error') && startedAt !== undefined
              ? Math.max(0, now - startedAt)
              : undefined))
      const memory = {
        ...(data as object),
        durationMs,
        startedAt,
        type: 'memory',
      } as ConversationPart
      if (index === -1) {
        return {
          ...turn,
          parts: [...closeStreamTail(turn.parts, now), memory],
        } as T
      }
      const parts = [...turn.parts]
      parts[index] = { ...parts[index]!, ...memory }
      return { ...turn, parts } as T
    }
    case 'run_blocked': {
      const reason = typeof data.reason === 'string' ? data.reason : ''
      const stats = isRecord(data.knownUsage) ? data.knownUsage : undefined
      const withStats = stats ? applyStats(turn, stats) : turn
      return {
        ...withStats,
        ...(reason ? { error: reason } : {}),
        parts: terminalizeParts(
          closeStreamTail(withStats.parts, now),
          reason,
          now,
        ),
      } as T
    }
    case 'run_terminal': {
      const outcome = data.outcome
      if (
        outcome !== 'completed' &&
        outcome !== 'error' &&
        outcome !== 'interrupted' &&
        outcome !== 'stopped'
      ) {
        return turn
      }
      const reason = typeof data.reason === 'string' ? data.reason : ''
      const stats = isRecord(data.stats) ? data.stats : undefined
      const withStats = stats ? applyStats(turn, stats) : turn
      const stopped = outcome === 'stopped'
      const error = outcome === 'error' || outcome === 'interrupted'
      const terminalReason = stopped ? 'Stopped.' : error ? reason : undefined
      const {
        error: _previousError,
        stopped: _previousStopped,
        ...canonicalBase
      } = withStats
      const statsDuration =
        stats && typeof stats.durationMs === 'number'
          ? stats.durationMs
          : undefined
      return {
        ...canonicalBase,
        durationMs:
          statsDuration ??
          (withStats.startedAt !== undefined
            ? Math.max(0, now - withStats.startedAt)
            : undefined),
        ...(error && reason ? { error: reason } : {}),
        isStreaming: false,
        parts: terminalizeParts(
          closeStreamTail(withStats.parts, now),
          terminalReason,
          now,
        ),
        ...(stopped ? { stopped: true } : {}),
      } as T
    }
    case 'stats': {
      return applyStats(turn, data)
    }
    case 'text': {
      return appendDelta(
        turn,
        'text',
        typeof data.delta === 'string' ? data.delta : '',
        now,
      )
    }
    case 'thinking': {
      return appendDelta(
        turn,
        'thinking',
        typeof data.delta === 'string' ? data.delta : '',
        now,
      )
    }
    case 'tool_call': {
      return applyToolCall(turn, data, now)
    }
    case 'tool_call_drop': {
      const id = typeof data.id === 'string' ? data.id : ''
      if (!id) return turn
      return {
        ...turn,
        parts: turn.parts.filter((p) => p.type !== 'tool_call' || p.id !== id),
      } as T
    }
    default:
      return turn
  }
}

/**
 * Reconstruct `ConversationTurn[]` from a client-messages log by replaying the
 * events — the same reduction the browser applies to the live SSE stream, so a
 * reload renders identically to the run that produced it. Each `dir:"in"`
 * prompt starts a turn; subsequent `dir:"out"` events populate it; `done`
 * finalizes. Any tool left `running`/`start` is terminalized to `error` on
 * restore (a finished log with no `done` is treated as a crashed/lost run).
 */
export function replayClientEvents(events: ClientEvent[]): ConversationTurn[] {
  const turns = buildTurnsFromEvents(events)

  // Restore: any tool still running/started when the log ended is terminalized.
  for (let index = 0; index < turns.length; index++) {
    turns[index] = {
      ...turns[index]!,
      parts: terminalizeParts(turns[index]!.parts),
    }
  }
  return turns
}

/**
 * Like `replayClientEvents` but leaves a still-streaming turn LIVE: the final
 * turn keeps `isStreaming: true` and any tool still `running`/`start` stays
 * that way (NO terminalize-to-error pass). Used for subscribe catch-up — a
 * reopened tab joining an in-flight run — where the restore variant would
 * falsely render genuinely-active tools as failed. The restore variant
 * remains correct for finished/crashed logs (reload of a completed project).
 */
export function replayClientEventsLive(
  events: ClientEvent[],
): ConversationTurn[] {
  return buildTurnsFromEvents(events)
}

/**
 * Terminalize a turn's still-running tool calls to `error` (immutable). Used on
 * `done`, on `error`, and on restore. `result` defaults to a generic
 * "did not return" message; an error path passes the error message through.
 */
export function terminalizeTools<T extends ConversationTurn>(
  turn: T,
  result: string = DEFAULT_TOOL_RESULT,
): T {
  const parts = terminalizeParts(turn.parts, result)
  return parts === turn.parts ? turn : ({ ...turn, parts } as T)
}

function acceptedAttachments(
  event: ClientEvent,
): ConversationTurn['attachments'] | undefined {
  if (event.lifecycle !== 'run_accepted' || !Array.isArray(event.attachments)) {
    return undefined
  }
  return event.attachments.flatMap((value, index) => {
    if (!isRecord(value) || typeof value.name !== 'string') return []
    const kind = value.kind === 'element' ? 'element' : 'image'
    return [
      {
        id:
          typeof value.assetPath === 'string'
            ? value.assetPath
            : `accepted-${index + 1}`,
        kind,
        ...(typeof value.mediaType === 'string'
          ? { mediaType: value.mediaType }
          : {}),
        name: value.name,
        ...(typeof value.byteLength === 'number'
          ? { size: value.byteLength }
          : {}),
        ...(typeof value.selector === 'string'
          ? { selector: value.selector }
          : {}),
      },
    ]
  })
}

function appendDelta<T extends ConversationTurn>(
  turn: T,
  kind: 'text' | 'thinking',
  delta: string,
  now: number,
): T {
  if (!delta) return turn
  const last = turn.parts[turn.parts.length - 1]
  if (last && last.type === kind) {
    const updated = [...turn.parts]
    updated[updated.length - 1] = { ...last, text: last.text + delta }
    return { ...turn, parts: updated } as T
  }
  return {
    ...turn,
    parts: [
      ...closeStreamTail(turn.parts, now),
      {
        id: `${turn.id}-${kind === 'text' ? 'text' : 'think'}`,
        startedAt: now,
        text: delta,
        type: kind,
      },
    ],
  } as T
}

function applyStats<T extends ConversationTurn>(
  turn: T,
  data: Record<string, unknown>,
): T {
  const stats = { ...(data as object), type: 'stats' } as ConversationPart
  const index = turn.parts.findIndex((part) => part.type === 'stats')
  if (index === -1) {
    return { ...turn, parts: [...turn.parts, stats] } as T
  }
  const parts = [...turn.parts]
  parts[index] = stats
  return { ...turn, parts } as T
}

function applyToolCall<T extends ConversationTurn>(
  turn: T,
  data: Record<string, unknown>,
  now: number,
): T {
  const payload = {
    ...(data as unknown as Omit<
      Extract<ConversationPart, { type: 'tool_call' }>,
      'type'
    >),
    type: 'tool_call' as const,
  }
  const idx = turn.parts.findIndex(
    (part) => part.type === 'tool_call' && part.id === payload.id,
  )
  const prevPart =
    idx !== -1
      ? (turn.parts[idx] as Extract<ConversationPart, { type: 'tool_call' }>)
      : undefined
  const isTerminal = payload.state === 'done' || payload.state === 'error'
  const startedAt =
    payload.startedAt ??
    prevPart?.startedAt ??
    (payload.state === 'running' || payload.state === 'start' ? now : undefined)
  const durationMs =
    payload.durationMs ??
    prevPart?.durationMs ??
    (isTerminal && startedAt !== undefined
      ? Math.max(0, now - startedAt)
      : undefined)

  let parts: ConversationPart[]
  if (idx !== -1) {
    const prev = prevPart!
    const updated = [...turn.parts]
    updated[idx] = {
      ...prev,
      ...payload,
      action: payload.action ?? prev.action,
      detail: payload.detail ?? prev.detail,
      durationMs,
      result: payload.result ?? prev.result,
      startedAt,
    }
    parts = updated
  } else {
    parts = [
      ...closeStreamTail(turn.parts, now),
      { ...payload, durationMs, startedAt },
    ]
  }

  const htmlSwaps =
    payload.tool === 'edit' && payload.state === 'done'
      ? turn.htmlSwaps + 1
      : turn.htmlSwaps
  return htmlSwaps === turn.htmlSwaps && parts === turn.parts
    ? turn
    : ({ ...turn, htmlSwaps, parts } as T)
}

/** Build `ConversationTurn[]` from a client-messages log by replaying events,
 *  WITHOUT any terminalization pass. Each `dir:"in"` prompt starts a turn
 *  (streaming); subsequent `dir:"out"` events populate it via the shared
 *  per-event reducer. Shared by `replayClientEvents` (restore, terminalizes
 *  active tools to error) and `replayClientEventsLive` (subscribe catch-up,
 *  leaves active tools live). */
function buildTurnsFromEvents(events: ClientEvent[]): ConversationTurn[] {
  const turns: ConversationTurn[] = []
  const turnIndexBySequence = new Map<number, number>()
  let currentIndex = -1

  for (const event of events) {
    if (event.dir === 'in') {
      if (event.type === 'prompt') {
        const attachments = acceptedAttachments(event)
        turns.push({
          ...(attachments ? { attachments } : {}),
          htmlSwaps: 0,
          id:
            typeof event.turnId === 'string'
              ? event.turnId
              : `turn-${turns.length + 1}`,
          isStreaming: true,
          model: typeof event.model === 'string' ? event.model : '',
          parts: [],
          prompt: typeof event.prompt === 'string' ? event.prompt : '',
          startedAt: eventNow(event),
        })
        currentIndex = turns.length - 1
        if (typeof event.seq === 'number') {
          turnIndexBySequence.set(event.seq, currentIndex)
        }
      }
      continue
    }

    const turnIdIndex =
      typeof event.turnId === 'string'
        ? turns.findIndex((turn) => turn.id === event.turnId)
        : -1
    const legacyPromptSequence =
      event.event === 'run_terminal' && isRecord(event.payload)
        ? event.payload.legacyPromptSeq
        : undefined
    const targetIndex =
      turnIdIndex !== -1
        ? turnIdIndex
        : typeof legacyPromptSequence === 'number'
          ? (turnIndexBySequence.get(legacyPromptSequence) ?? -1)
          : typeof event.turnId === 'string'
            ? -1
            : currentIndex
    if (targetIndex === -1) continue
    turns[targetIndex] = applyEventToTurn(turns[targetIndex]!, event)
  }

  return turns
}

/**
 * Freeze the trailing text/thinking part's duration once a different part
 * follows it (or the turn ends). No-op when the tail is already closed.
 */
function closeStreamTail(
  parts: ConversationPart[],
  now: number,
): ConversationPart[] {
  const last = parts[parts.length - 1]
  if (
    !last ||
    !isStreamTail(last) ||
    last.startedAt === undefined ||
    last.durationMs !== undefined
  ) {
    return parts
  }
  const updated = [...parts]
  updated[updated.length - 1] = {
    ...last,
    durationMs: Math.max(0, now - last.startedAt),
  }
  return updated
}

/** Event time in epoch ms: the logged envelope `ts` on replay, local clock live. */
function eventNow(event: ClientEvent): number {
  const parsed = typeof event.ts === 'string' ? Date.parse(event.ts) : NaN
  return Number.isFinite(parsed) ? parsed : Date.now()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isStreamTail(part: ConversationPart): part is StreamTail {
  return part.type === 'text' || part.type === 'thinking'
}

function terminalizeParts(
  parts: ConversationPart[],
  result: string = DEFAULT_TOOL_RESULT,
  now: number = Date.now(),
): ConversationPart[] {
  let changed = false
  const next = parts.map((part) => {
    if (
      isStreamTail(part) &&
      part.startedAt !== undefined &&
      part.durationMs === undefined
    ) {
      changed = true
      return { ...part, durationMs: Math.max(0, now - part.startedAt) }
    }
    if (
      part.type !== 'tool_call' ||
      (part.state !== 'running' && part.state !== 'start')
    ) {
      return part
    }
    changed = true
    return {
      ...part,
      durationMs:
        part.durationMs ??
        (part.startedAt !== undefined
          ? Math.max(0, now - part.startedAt)
          : undefined),
      result: part.result ?? result,
      state: 'error' as const,
    }
  })
  return changed ? next : parts
}
