import { Buffer } from 'node:buffer'
import type { ServerResponse } from 'node:http'

import {
  PROTOCOL_MAX_DOCUMENT_EVENT_FRAME_BYTES,
  PROTOCOL_MAX_EVENT_DATA_BYTES,
  PROTOCOL_MAX_QUEUED_BYTES,
  PROTOCOL_MAX_QUEUED_EVENTS,
  PROTOCOL_MAX_LIST_SNAPSHOT_FRAME_BYTES,
  PROTOCOL_MAX_PROJECT_SNAPSHOT_FRAME_BYTES,
  PROTOCOL_MAX_DOCUMENT_BYTES,
  ProjectEventSchema,
  ProjectListSnapshotSchema,
  ProjectSnapshotSchema,
  PROTOCOL_HEARTBEAT_MS,
  type ProjectEvent,
  type ProtocolErrorCode,
} from '@workspace/contracts'
import { replayClientEventsLive } from '@workspace/conversation'
import { ZodError } from 'zod'

import type {
  CommittedClientMessageEntry,
  ProjectRepository,
  ProjectSnapshot,
  RunStatus,
} from '../mastra/lib/project-store.ts'
import { startSse } from '../mastra/lib/sse.ts'

export interface ProjectEventDelivery {
  openList(response: ServerResponse): Promise<void>
  openProject(projectId: string, response: ServerResponse): Promise<boolean>
}

export function createProjectEventDelivery(
  repository: ProjectRepository,
): ProjectEventDelivery {
  async function openProject(
    projectId: string,
    response: ServerResponse,
  ): Promise<boolean> {
    const queued: CommittedClientMessageEntry[] = []
    let queuedBytes = 0
    let closed = false
    let snapshotSent = false
    let writing = Promise.resolve()
    let heartbeat: NodeJS.Timeout | undefined
    let heartbeatPending = false
    const connection = new AbortController()

    const cleanup = () => {
      if (closed) return
      closed = true
      connection.abort()
      unsubscribe()
      if (heartbeat) clearInterval(heartbeat)
    }
    const enqueue = (_id: string, record: CommittedClientMessageEntry) => {
      if (closed) return
      const bytes = Buffer.byteLength(JSON.stringify(record), 'utf8')
      queued.push(record)
      queuedBytes += bytes
      if (
        queued.length > PROTOCOL_MAX_QUEUED_EVENTS ||
        queuedBytes > PROTOCOL_MAX_QUEUED_BYTES
      ) {
        cleanup()
        response.end()
        return
      }
      if (snapshotSent) scheduleDrain()
    }
    const unsubscribe = repository.subscribeProjectCommits(projectId, enqueue)
    response.once('close', cleanup)
    response.once('error', cleanup)

    function scheduleDrain() {
      writing = writing.then(drainQueue).catch(() => {
        cleanup()
        response.end()
      })
    }

    async function drainQueue() {
      while (!closed && queued.length > 0) {
        const record = queued.shift()!
        queuedBytes -= Buffer.byteLength(JSON.stringify(record), 'utf8')
        let event: ProjectEvent
        try {
          event = mapRecord(projectId, record)
        } catch (error) {
          if (!(error instanceof ZodError)) throw error
          await writeProtocolError(
            response,
            'INVALID_EVENT',
            'A committed project event is invalid.',
            connection.signal,
          )
          throw new Error('Invalid committed project event.')
        }
        try {
          event = await enrichEvent(repository, projectId, event)
        } catch (error) {
          if (!(error instanceof ZodError)) throw error
          await writeProtocolError(
            response,
            'INVALID_EVENT',
            'A committed project event is invalid.',
            connection.signal,
          )
          throw new Error('Invalid committed project event.')
        }
        await writeProjectEvent(response, event, connection.signal)
      }
    }

    try {
      const result = await repository.readSnapshot(projectId)
      if (closed) return true
      if (!result) {
        cleanup()
        return false
      }
      if (!result.ok) {
        cleanup()
        response.writeHead(503, {
          'content-type': 'application/json; charset=utf-8',
        })
        response.end(
          JSON.stringify({
            error: 'Project snapshot is temporarily busy.',
            ok: false,
          }),
        )
        return true
      }
      if (result.snapshot.journalStatus !== 'clean') {
        startSse(response)
        await writeProtocolError(
          response,
          'INVALID_EVENT',
          'Project history requires storage recovery.',
          connection.signal,
        )
        cleanup()
        response.end()
        return true
      }
      const snapshot = toWireSnapshot(projectId, result.snapshot)
      startSse(response)
      if (
        Buffer.byteLength(snapshot.html, 'utf8') > PROTOCOL_MAX_DOCUMENT_BYTES
      ) {
        await writeProtocolError(
          response,
          'DOCUMENT_TOO_LARGE',
          'The project document is too large for editor transport.',
          connection.signal,
        )
        cleanup()
        response.end()
        return true
      }
      await writeFrame(
        response,
        'state',
        snapshot,
        PROTOCOL_MAX_PROJECT_SNAPSHOT_FRAME_BYTES,
        undefined,
        connection.signal,
      )
      const cursor = snapshot.cursor
      while (queued.length > 0 && queued[0]!.seq <= cursor) {
        const record = queued.shift()!
        queuedBytes -= Buffer.byteLength(JSON.stringify(record), 'utf8')
      }
      snapshotSent = true
      heartbeat = setInterval(() => {
        if (closed || heartbeatPending) return
        heartbeatPending = true
        writing = writing
          .then(() => writeRaw(response, ': heartbeat\n\n', connection.signal))
          .finally(() => {
            heartbeatPending = false
          })
          .catch(() => {
            cleanup()
            response.end()
          })
      }, PROTOCOL_HEARTBEAT_MS)
      heartbeat.unref()
      scheduleDrain()
      return true
    } catch (error) {
      if (error instanceof ZodError && !closed) {
        if (!response.headersSent) startSse(response)
        await writeProtocolError(
          response,
          'INVALID_EVENT',
          'The project snapshot is invalid.',
          connection.signal,
        ).catch(() => {})
      }
      cleanup()
      if (!response.headersSent && !(error instanceof ZodError)) throw error
      response.end()
      return true
    }
  }

  async function openList(response: ServerResponse): Promise<void> {
    let closed = false
    let dirty = true
    let timer: NodeJS.Timeout | undefined
    let writing = Promise.resolve()
    let heartbeatPending = false
    const connection = new AbortController()
    const cleanup = () => {
      if (closed) return
      closed = true
      connection.abort()
      unsubscribe()
      if (timer) clearTimeout(timer)
      clearInterval(heartbeat)
    }
    const schedule = () => {
      dirty = true
      if (closed || timer) return
      timer = setTimeout(() => {
        timer = undefined
        writing = writing.then(refresh).catch(handleWriterError)
      }, 50)
    }
    const unsubscribe = repository.subscribeProjectListInvalidations(schedule)
    response.once('close', cleanup)
    response.once('error', cleanup)
    const heartbeat = setInterval(() => {
      if (closed || heartbeatPending) return
      heartbeatPending = true
      writing = writing
        .then(() => writeRaw(response, ': heartbeat\n\n', connection.signal))
        .finally(() => {
          heartbeatPending = false
        })
        .catch(() => {
          cleanup()
          response.end()
        })
    }, PROTOCOL_HEARTBEAT_MS)
    heartbeat.unref()
    startSse(response)

    async function refresh() {
      while (!closed && dirty) {
        dirty = false
        const projects = (await repository.listProjects()).filter(
          (project) => project.hasHtml,
        )
        const snapshot = ProjectListSnapshotSchema.parse({
          projects,
          version: 2,
        })
        await writeFrame(
          response,
          'list_state',
          snapshot,
          PROTOCOL_MAX_LIST_SNAPSHOT_FRAME_BYTES,
          undefined,
          connection.signal,
        )
      }
    }

    async function handleWriterError(error: unknown) {
      if (error instanceof ZodError && !closed) {
        await writeProtocolError(
          response,
          'INVALID_EVENT',
          'The project list snapshot is invalid.',
          connection.signal,
        ).catch(() => {})
      }
      cleanup()
      response.end()
    }

    try {
      writing = refresh()
      await writing
    } catch (error) {
      await handleWriterError(error)
    }
  }

  return { openList, openProject }
}

export async function writeUnsupportedVersion(response: ServerResponse) {
  const connection = new AbortController()
  const cleanup = () => connection.abort()
  response.once('close', cleanup)
  response.once('error', cleanup)
  startSse(response)
  try {
    await writeProtocolError(
      response,
      'UNSUPPORTED_VERSION',
      'The requested event protocol version is not supported.',
      connection.signal,
    )
  } finally {
    response.off('close', cleanup)
    response.off('error', cleanup)
    response.end()
  }
}

function deriveRun(
  snapshot: ProjectSnapshot,
  turns: ReturnType<typeof replayClientEventsLive>,
) {
  let turnId: null | string = null
  let startedAt: null | string = null
  let status: RunStatus = 'idle'
  let blocked = false
  let reason: string | undefined
  let canonical = false
  let terminalized = false
  let promptIndex = 0
  const turnByPromptSequence = new Map<number, string>()
  for (const record of snapshot.conversationRecords) {
    if (record.dir === 'in' && record.type === 'prompt') {
      promptIndex += 1
      turnId =
        typeof record.turnId === 'string'
          ? record.turnId
          : `turn-${promptIndex}`
      turnByPromptSequence.set(record.seq, turnId)
      startedAt = record.ts
      status = 'running'
      blocked = false
      reason = undefined
      canonical = isAccepted(record)
      terminalized = false
      continue
    }
    if (record.dir !== 'out' || !turnId) continue
    const recordTurnId =
      record.event === 'run_terminal' &&
      isRecord(record.payload) &&
      typeof record.payload.legacyPromptSeq === 'number'
        ? turnByPromptSequence.get(record.payload.legacyPromptSeq)
        : record.turnId
    if (
      record.event === 'run_blocked' &&
      isRecord(record.payload) &&
      recordTurnId === turnId
    ) {
      blocked = true
      status = 'error'
      reason =
        typeof record.payload.reason === 'string'
          ? record.payload.reason
          : undefined
      continue
    }
    if (
      record.event === 'run_terminal' &&
      isRecord(record.payload) &&
      recordTurnId === turnId
    ) {
      blocked = false
      const outcome = record.payload.outcome
      status =
        outcome === 'stopped'
          ? 'stopped'
          : outcome === 'completed'
            ? 'idle'
            : outcome === 'interrupted'
              ? 'interrupted'
              : 'error'
      reason =
        typeof record.payload.reason === 'string'
          ? record.payload.reason
          : undefined
      canonical = false
      terminalized = true
      continue
    }
    if (
      !canonical &&
      !terminalized &&
      (record.event === 'done' || record.event === 'error') &&
      (typeof record.turnId !== 'string' || record.turnId === turnId)
    ) {
      blocked = false
      const legacyReason =
        record.event === 'error' &&
        isRecord(record.payload) &&
        typeof record.payload.message === 'string'
          ? record.payload.message
          : undefined
      status =
        record.event === 'done'
          ? 'idle'
          : legacyReason === 'stopped'
            ? 'stopped'
            : 'error'
      reason = legacyReason
    }
  }
  if (!turnId) {
    const latest = turns.at(-1)
    if (latest?.isStreaming) {
      turnId = latest.id
      status = 'running'
      startedAt =
        latest.startedAt == null
          ? null
          : new Date(latest.startedAt).toISOString()
    }
  }
  return { blocked, ...(reason ? { reason } : {}), startedAt, status, turnId }
}

async function enrichEvent(
  repository: ProjectRepository,
  projectId: string,
  event: ProjectEvent,
): Promise<ProjectEvent> {
  if (event.type !== 'document_changed') return event
  const result = await repository.readSnapshot(projectId)
  if (!result?.ok || result.snapshot.documentHash !== event.payload.hash)
    return event
  return ProjectEventSchema.parse({
    ...event,
    payload: { ...event.payload, html: result.snapshot.indexHtml },
  })
}

function isAccepted(
  record: CommittedClientMessageEntry,
): record is CommittedClientMessageEntry & {
  lifecycle: 'run_accepted'
  turnId: string
} {
  return (
    record.dir === 'in' &&
    record.lifecycle === 'run_accepted' &&
    typeof record.turnId === 'string'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function mapRecord(
  projectId: string,
  record: CommittedClientMessageEntry,
): ProjectEvent {
  const base = {
    projectId,
    seq: record.seq,
    ts: record.ts,
    turnId: typeof record.turnId === 'string' ? record.turnId : null,
    version: 2 as const,
  }
  if (isAccepted(record)) {
    return ProjectEventSchema.parse({
      ...base,
      payload: {
        attachments: record.attachments,
        compactionPercent: record.compactionPercent,
        imageModel: record.imageModel,
        model: record.model,
        prompt: record.prompt,
        requestDigest: record.requestDigest,
        requestVersion: record.requestVersion,
        visionModel: record.visionModel,
      },
      turnId: record.turnId,
      type: 'run_accepted',
    })
  }
  const type = typeof record.event === 'string' ? record.event : 'checkpoint'
  const supported = new Set([
    'attachments_update',
    'document_changed',
    'memory',
    'project_meta',
    'retry',
    'run_blocked',
    'run_terminal',
    'stats',
    'text',
    'thinking',
    'tool_call',
    'tool_call_drop',
  ])
  if (!supported.has(type))
    return ProjectEventSchema.parse({
      ...base,
      payload: {},
      type: 'checkpoint',
    })
  return ProjectEventSchema.parse({
    ...base,
    payload: record.payload ?? {},
    type,
  })
}

function toWireSnapshot(projectId: string, snapshot: ProjectSnapshot) {
  const turns = replayClientEventsLive(snapshot.conversationRecords)
  const run = deriveRun(snapshot, turns)
  return ProjectSnapshotSchema.parse({
    brief: snapshot.metadata.brief,
    cursor: snapshot.committedWatermark,
    documentHash: snapshot.documentHash,
    html: snapshot.indexHtml,
    models: {
      image: snapshot.metadata.imageModel,
      text: snapshot.metadata.model,
      vision: snapshot.metadata.visionModel,
    },
    projectId,
    run,
    title: snapshot.metadata.title,
    titleSource: snapshot.metadata.titleSource,
    turns: turns.length > 0 ? turns : snapshot.messages,
    version: 2,
  })
}

async function writeFrame(
  response: ServerResponse,
  event: string,
  payload: unknown,
  cap: number,
  id: number | undefined,
  signal: AbortSignal,
) {
  const data = JSON.stringify(payload)
  const frame = `${id == null ? '' : `id: ${id}\n`}event: ${event}\ndata: ${data}\n\n`
  if (Buffer.byteLength(frame, 'utf8') > cap) {
    if (event === 'protocol_error')
      throw new Error('Protocol error frame exceeds limit.')
    const code: ProtocolErrorCode =
      event === 'state'
        ? 'SNAPSHOT_TOO_LARGE'
        : event === 'list_state'
          ? 'SNAPSHOT_TOO_LARGE'
          : event === 'project_event'
            ? 'EVENT_TOO_LARGE'
            : 'EVENT_TOO_LARGE'
    await writeProtocolError(
      response,
      code,
      `${event} frame exceeds its transport limit.`,
      signal,
    )
    throw new Error(`${event} frame exceeds transport limit.`)
  }
  await writeRaw(response, frame, signal)
}

async function writeProjectEvent(
  response: ServerResponse,
  event: ProjectEvent,
  signal: AbortSignal,
) {
  const cap =
    event.type === 'document_changed'
      ? PROTOCOL_MAX_DOCUMENT_EVENT_FRAME_BYTES
      : Number.MAX_SAFE_INTEGER
  if (
    event.type === 'document_changed' &&
    event.payload.html !== undefined &&
    Buffer.byteLength(event.payload.html, 'utf8') > PROTOCOL_MAX_DOCUMENT_BYTES
  ) {
    await writeProtocolError(
      response,
      'DOCUMENT_TOO_LARGE',
      'The project document is too large for editor transport.',
      signal,
    )
    throw new Error('Project document exceeds transport limit.')
  }
  if (
    event.type !== 'document_changed' &&
    Buffer.byteLength(JSON.stringify(event), 'utf8') >
      PROTOCOL_MAX_EVENT_DATA_BYTES
  ) {
    await writeProtocolError(
      response,
      'EVENT_TOO_LARGE',
      'The project event is too large for editor transport.',
      signal,
    )
    throw new Error('Project event exceeds transport limit.')
  }
  await writeFrame(response, 'project_event', event, cap, event.seq, signal)
}

async function writeProtocolError(
  response: ServerResponse,
  code: ProtocolErrorCode,
  message: string,
  signal: AbortSignal,
) {
  await writeFrame(
    response,
    'protocol_error',
    { code, message, version: 2 },
    PROTOCOL_MAX_EVENT_DATA_BYTES,
    undefined,
    signal,
  )
}

async function writeRaw(
  response: ServerResponse,
  value: string,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted()
  if (response.destroyed || response.writableEnded)
    throw new Error('SSE response closed.')
  if (response.write(value)) return
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => finish(new Error('SSE drain timed out.')),
      PROTOCOL_HEARTBEAT_MS,
    )
    timer.unref()
    const finish = (error?: unknown) => {
      clearTimeout(timer)
      response.off('drain', onDrain)
      response.off('close', onClose)
      response.off('error', onError)
      signal.removeEventListener('abort', onAbort)
      if (error) reject(error)
      else resolve()
    }
    const onDrain = () => finish()
    const onClose = () => finish(new Error('SSE response closed.'))
    const onError = (error: Error) => finish(error)
    const onAbort = () =>
      finish(signal.reason ?? new Error('SSE response aborted.'))
    response.once('drain', onDrain)
    response.once('close', onClose)
    response.once('error', onError)
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) onAbort()
  })
}
