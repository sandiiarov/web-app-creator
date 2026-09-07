import {
  ProjectEventSchema,
  ProjectSnapshotSchema,
  type ProjectEvent,
  type ProjectSnapshot,
  type StartRunCommand,
} from '@workspace/contracts'
import {
  applyEventToTurn,
  type ConversationTurn,
} from '@workspace/conversation'

export interface PendingSubmission {
  input: Readonly<StartRunCommand>
  outcome: 'submitting' | SubmissionOutcome
  turn: ConversationTurn
}
export type ProjectConnection =
  | 'connected'
  | 'connecting'
  | 'reconnecting'
  | 'unavailable'
export type ProjectSessionAction =
  | { connection: ProjectConnection; reason?: string; type: 'connection' }
  | { event: unknown; type: 'event' }
  | {
      input: Readonly<StartRunCommand>
      turn: ConversationTurn
      type: 'submitted'
    }
  | { result: SubmissionResult; type: 'submission_result' }
  | { snapshot: unknown; type: 'snapshot' }
export interface ProjectSessionState {
  accepted: Record<string, true>
  activeInputs: Record<string, Readonly<StartRunCommand>>
  connection: ProjectConnection
  cursor: number
  documentHash: string
  html: string
  models: ProjectSnapshot['models']
  needsSnapshot: boolean
  pending: Record<string, PendingSubmission>
  projectId: string
  run: ProjectSnapshot['run']
  title: string
  turns: ConversationTurn[]
  unavailableReason?: string
}
export type SubmissionOutcome = 'accepted' | 'rejected' | 'unknown'

export interface SubmissionResult {
  outcome: SubmissionOutcome
  reason?: string
  turnId: string
}

export function createProjectSession(projectId: string): ProjectSessionState {
  return {
    accepted: {},
    activeInputs: {},
    connection: 'connecting',
    cursor: 0,
    documentHash: '',
    html: '',
    models: { image: '', text: '', vision: '' },
    needsSnapshot: false,
    pending: {},
    projectId,
    run: { blocked: false, startedAt: null, status: 'idle', turnId: null },
    title: 'Untitled',
    turns: [],
  }
}

export function reduceProjectSession(
  state: ProjectSessionState,
  action: ProjectSessionAction,
): ProjectSessionState {
  if (action.type === 'connection')
    return {
      ...state,
      connection: action.connection,
      unavailableReason:
        action.connection === 'unavailable'
          ? (action.reason ?? state.unavailableReason)
          : undefined,
    }
  if (action.type === 'submitted') {
    if (action.input.projectId !== state.projectId) return state
    return {
      ...state,
      pending: {
        ...state.pending,
        [action.turn.id]: {
          input: action.input,
          outcome: 'submitting',
          turn: action.turn,
        },
      },
      run: {
        blocked: false,
        startedAt: new Date(action.turn.startedAt ?? Date.now()).toISOString(),
        status: 'running',
        turnId: action.turn.id,
      },
      turns: mergeTurn(state.turns, action.turn),
    }
  }
  if (action.type === 'submission_result') {
    const pending = state.pending[action.result.turnId]
    if (!pending) return state
    if (action.result.outcome === 'accepted') {
      return {
        ...state,
        accepted: { ...state.accepted, [action.result.turnId]: true },
        activeInputs: {
          ...state.activeInputs,
          [action.result.turnId]: pending.input,
        },
        pending: withoutKey(state.pending, action.result.turnId),
      }
    }
    const next = { ...pending, outcome: action.result.outcome }
    if (action.result.outcome === 'unknown')
      return {
        ...state,
        pending: { ...state.pending, [action.result.turnId]: next },
      }
    const turn = applyEventToTurn(
      { ...pending.turn, isStreaming: false },
      {
        dir: 'out',
        event: 'error',
        payload: { message: action.result.reason ?? 'Request rejected.' },
        ts: '',
        turnId: action.result.turnId,
      },
    )
    return {
      ...state,
      pending: withoutKey(state.pending, action.result.turnId),
      run:
        state.run.turnId === action.result.turnId
          ? {
              blocked: false,
              startedAt: state.run.startedAt,
              status: 'idle',
              turnId: null,
            }
          : state.run,
      turns: mergeTurn(state.turns, turn),
    }
  }
  if (action.type === 'snapshot') {
    const snapshot = ProjectSnapshotSchema.parse(action.snapshot)
    if (snapshot.projectId !== state.projectId) return state
    const represented = new Set(snapshot.turns.map((turn) => turn.id))
    const optimistic = Object.values(state.pending)
      .filter(
        (item) => !represented.has(item.turn.id) && item.outcome !== 'rejected',
      )
      .map((item) => item.turn)
    let accepted = { ...state.accepted }
    let activeInputs = { ...state.activeInputs }
    let pending = { ...state.pending }
    for (const turn of snapshot.turns) {
      accepted[turn.id] = true
      if (pending[turn.id]) {
        activeInputs[turn.id] = pending[turn.id]!.input
        pending = withoutKey(pending, turn.id)
      }
      if (!turn.isStreaming) activeInputs = withoutKey(activeInputs, turn.id)
    }
    return {
      ...state,
      accepted,
      activeInputs,
      connection: 'connected',
      cursor: snapshot.cursor,
      documentHash: snapshot.documentHash,
      html: snapshot.html,
      models: snapshot.models,
      needsSnapshot: false,
      pending,
      run: snapshot.run,
      title: snapshot.title,
      turns: [...snapshot.turns, ...optimistic],
    }
  }
  const event = ProjectEventSchema.parse(action.event)
  if (event.projectId !== state.projectId || event.seq <= state.cursor)
    return state
  if (event.seq !== state.cursor + 1)
    return { ...state, connection: 'reconnecting', needsSnapshot: true }
  let next: ProjectSessionState = { ...state, cursor: event.seq }
  if (event.type === 'checkpoint') return next
  if (event.type === 'document_changed') {
    return event.payload.html === undefined
      ? { ...next, documentHash: event.payload.hash, needsSnapshot: true }
      : { ...next, documentHash: event.payload.hash, html: event.payload.html }
  }
  if (event.type === 'project_meta') {
    return {
      ...next,
      models: {
        image: event.payload.imageModel ?? next.models.image,
        text: event.payload.model ?? next.models.text,
        vision: event.payload.visionModel ?? next.models.vision,
      },
      title: event.payload.title ?? next.title,
    }
  }
  const turnId = event.turnId
  if (!turnId) return next
  if (event.type === 'run_accepted') {
    const pending = next.pending[turnId]
    const existing = next.turns.find((turn) => turn.id === turnId)
    if (next.accepted[turnId] && existing && !existing.isStreaming) return next
    const turn: ConversationTurn = pending?.turn ?? {
      attachments: event.payload.attachments.map((attachment, index) => ({
        id: `${turnId}-attachment-${index}`,
        kind: attachment.kind,
        mediaType: attachment.mediaType,
        name: attachment.name,
        selector: attachment.selector,
        size: attachment.byteLength,
      })),
      htmlSwaps: 0,
      id: turnId,
      isStreaming: true,
      model: event.payload.model,
      parts: [],
      prompt: event.payload.prompt,
      startedAt: Date.parse(event.ts),
    }
    return {
      ...next,
      accepted: { ...next.accepted, [turnId]: true },
      activeInputs: pending
        ? { ...next.activeInputs, [turnId]: pending.input }
        : next.activeInputs,
      pending: pending ? withoutKey(next.pending, turnId) : next.pending,
      run: { blocked: false, startedAt: event.ts, status: 'running', turnId },
      turns: mergeTurn(next.turns, turn),
    }
  }
  const current = next.turns.find((turn) => turn.id === turnId)
  if (!current) return { ...next, needsSnapshot: true }
  let updated = current
  if (event.type === 'retry') {
    updated = {
      ...current,
      parts: [
        ...current.parts,
        {
          ...event.payload,
          id: `${turnId}-retry-${event.payload.attempt}`,
          startedAt: Date.parse(event.ts),
          type: 'retry',
        },
      ],
    }
  } else {
    const payload =
      event.type === 'tool_call' && event.payload.tool === 'analyze_image'
        ? withSubmittedImages(event.payload, next.activeInputs[turnId])
        : event.payload
    updated = applyEventToTurn(current, {
      dir: 'out',
      event: event.type,
      payload,
      ts: event.ts,
      turnId,
    })
  }
  if (event.type === 'run_blocked')
    next = {
      ...next,
      run: {
        blocked: true,
        reason: event.payload.reason,
        startedAt: next.run.startedAt,
        status: 'error',
        turnId,
      },
    }
  if (event.type === 'run_terminal')
    next = {
      ...next,
      accepted: { ...next.accepted, [turnId]: true },
      activeInputs: withoutKey(next.activeInputs, turnId),
      pending: withoutKey(next.pending, turnId),
      run:
        next.run.turnId === turnId
          ? {
              blocked: false,
              reason: event.payload.reason,
              startedAt: next.run.startedAt,
              status: terminalStatus(event.payload.outcome),
              turnId,
            }
          : next.run,
    }
  return { ...next, turns: mergeTurn(next.turns, updated) }
}

function mergeTurn(turns: ConversationTurn[], next: ConversationTurn) {
  const index = turns.findIndex((turn) => turn.id === next.id)
  if (index < 0) return [...turns, next]
  const copy = [...turns]
  copy[index] = next
  return copy
}

function terminalStatus(
  outcome: 'completed' | 'error' | 'interrupted' | 'stopped',
) {
  return outcome === 'completed' ? 'idle' : outcome
}

function withoutKey<T>(
  record: Record<string, T>,
  key: string,
): Record<string, T> {
  const { [key]: _removed, ...remaining } = record
  return remaining
}

function withSubmittedImages(
  payload: Extract<ProjectEvent, { type: 'tool_call' }>['payload'],
  input: Readonly<StartRunCommand> | undefined,
) {
  const images = (input?.attachments ?? []).flatMap((attachment) =>
    attachment.kind === 'element'
      ? []
      : [{ alt: attachment.name, url: attachment.dataUrl }],
  )
  return images.length === 0
    ? payload
    : { ...payload, images: [...images, ...(payload.images ?? [])] }
}
