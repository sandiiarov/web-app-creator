import type {
  ClientEvent,
  ConversationPart,
  ConversationTurn,
} from './types.ts'

const DEFAULT_TOOL_RESULT =
  'Tool did not return a result before the response completed.'

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

  switch (type) {
    case 'attachments_update': {
      if (!Array.isArray(data.attachments)) return turn
      return { ...turn, attachments: data.attachments } as T
    }
    case 'done': {
      return {
        ...turn,
        isStreaming: false,
        parts: terminalizeParts(turn.parts),
      } as T
    }
    case 'error': {
      const message = typeof data.message === 'string' ? data.message : ''
      if (!message) return turn
      if (message === 'stopped') {
        return {
          ...turn,
          parts: terminalizeParts(turn.parts, 'Stopped.'),
          stopped: true,
        } as T
      }
      return {
        ...turn,
        error: message,
        parts: terminalizeParts(turn.parts, message),
      } as T
    }
    case 'stats': {
      const stats = { ...(data as object), type: 'stats' } as ConversationPart
      const index = turn.parts.findIndex((part) => part.type === 'stats')
      if (index === -1) {
        return { ...turn, parts: [...turn.parts, stats] } as T
      }
      const parts = [...turn.parts]
      parts[index] = stats
      return { ...turn, parts } as T
    }
    case 'text': {
      return appendDelta(
        turn,
        'text',
        typeof data.delta === 'string' ? data.delta : '',
      )
    }
    case 'thinking': {
      return appendDelta(
        turn,
        'thinking',
        typeof data.delta === 'string' ? data.delta : '',
      )
    }
    case 'tool_call': {
      return applyToolCall(turn, data)
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

function appendDelta<T extends ConversationTurn>(
  turn: T,
  kind: 'text' | 'thinking',
  delta: string,
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
      ...turn.parts,
      {
        id: `${turn.id}-${kind === 'text' ? 'text' : 'think'}`,
        text: delta,
        type: kind,
      },
    ],
  } as T
}

function applyToolCall<T extends ConversationTurn>(
  turn: T,
  data: Record<string, unknown>,
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

  let parts: ConversationPart[]
  if (idx !== -1) {
    const prev = turn.parts[idx] as Extract<
      ConversationPart,
      { type: 'tool_call' }
    >
    const updated = [...turn.parts]
    updated[idx] = {
      ...prev,
      ...payload,
      action: payload.action ?? prev.action,
      detail: payload.detail ?? prev.detail,
      result: payload.result ?? prev.result,
    }
    parts = updated
  } else {
    parts = [...turn.parts, payload]
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
  let currentIndex = -1

  for (const event of events) {
    if (event.dir === 'in') {
      if (event.type === 'prompt') {
        turns.push({
          htmlSwaps: 0,
          id:
            typeof event.turnId === 'string'
              ? event.turnId
              : `turn-${turns.length + 1}`,
          isStreaming: true,
          model: typeof event.model === 'string' ? event.model : '',
          parts: [],
          prompt: typeof event.prompt === 'string' ? event.prompt : '',
        })
        currentIndex = turns.length - 1
      }
      continue
    }

    if (currentIndex === -1) continue
    turns[currentIndex] = applyEventToTurn(turns[currentIndex]!, event)
  }

  return turns
}

function terminalizeParts(
  parts: ConversationPart[],
  result: string = DEFAULT_TOOL_RESULT,
): ConversationPart[] {
  let changed = false
  const next = parts.map((part) => {
    if (
      part.type !== 'tool_call' ||
      (part.state !== 'running' && part.state !== 'start')
    ) {
      return part
    }
    changed = true
    return { ...part, result: part.result ?? result, state: 'error' as const }
  })
  return changed ? next : parts
}
