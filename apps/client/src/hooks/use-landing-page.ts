import {
  ProjectEventSchema,
  ProtocolErrorSchema,
  type StartRunCommand,
} from '@workspace/contracts'
import { terminalizeTools } from '@workspace/conversation'
import {
  DEFAULT_LANDING_MODELS,
  type LandingAgentSendInput,
  type LandingAgentSendResult,
  type LandingModels,
  type LandingTurn,
  type PromptAttachmentInput,
  type PromptAttachmentMeta,
  resolveLandingModels,
} from '@workspace/prompt-panel'
import { useCallback, useEffect, useRef, useState } from 'react'

import { deleteDraft, saveDraft } from '../lib/project-drafts'
import {
  createProjectSession,
  reduceProjectSession,
  type ProjectSessionAction,
} from '../lib/project-session'
import {
  ProjectNotFoundError,
  expandProjectImageUrls,
  parseProjectSnapshot,
  projectEventsUrl,
  sendPrompt,
  stopProjectAgent,
  updateProjectModels,
} from '../lib/projects-api'
import {
  subscribeWithRecovery,
  type ConnectionStatus as TransportConnectionStatus,
} from '../lib/reconnecting-stream'

export interface UseLandingPage {
  compactionPercent: number
  connection: ConnectionStatus
  html: string
  isStopping: boolean
  isStreaming: boolean
  missing: boolean
  models: LandingModels
  reconnect: () => void
  send: (input: LandingAgentSendInput) => Promise<LandingAgentSendResult>
  setCompactionPercent: (percent: number) => void
  setModels: (models: LandingModels) => void
  setTitle: (title: string) => void
  stop: () => void
  title: string
  turns: LandingTurn[]
}

export interface UseLandingPageOptions {
  onError: (message: string) => void
  projectId: string
}

type ConnectionStatus = 'connecting' | 'live' | 'offline' | 'reconnecting'

const STOP_SAFETY_MS = 8000

let turnSeq = 0
const nextTurnId = () => `turn-${Date.now()}-${turnSeq++}`

const COMPACTION_PERCENT_STORAGE_KEY = 'landing.compactionPercent.v1'
const DEFAULT_COMPACTION_PERCENT = 80

export function useLandingPage({
  onError,
  projectId,
}: UseLandingPageOptions): UseLandingPage {
  const [turns, setTurns] = useState<LandingTurn[]>([])
  const [html, setHtml] = useState('')
  const [title, setTitle] = useState('Untitled')
  const [connection, setConnection] = useState<ConnectionStatus>('connecting')
  const connectionRef = useRef<ConnectionStatus>('connecting')
  const [reconnectKey, setReconnectKey] = useState(0)
  const [isStopping, setIsStopping] = useState(false)
  const reconnect = useCallback(() => setReconnectKey((value) => value + 1), [])
  const [models, setModelsState] = useState<LandingModels>(
    DEFAULT_LANDING_MODELS,
  )
  const [compactionPercent, setCompactionPercentState] = useState(
    readStoredCompactionPercent,
  )
  const [isStreaming, setIsStreaming] = useState(false)
  const [missing, setMissing] = useState(false)

  // Synchronous send lock (two sends in one render tick must not both fire).
  const sendingRef = useRef(false)
  // Attachments from the in-flight send, used to enrich `analyze_image` tool
  // diagnostics with the uploaded image data URLs (which never round-trip
  // through the durable event log).
  const stoppingRef = useRef(false)
  const stopSafetyRef = useRef<null | number>(null)
  const modelSaveSeq = useRef(0)
  const sessionRef = useRef(createProjectSession(projectId))
  const mountedGeneration = useRef(0)
  const mountedLifetime = useRef(0)
  const retriedUnknownTurns = useRef(new Set<string>())

  useEffect(() => {
    const lifetime = ++mountedLifetime.current
    return () => {
      if (mountedLifetime.current === lifetime) mountedLifetime.current += 1
    }
  }, [])

  const applySession = useCallback((action: ProjectSessionAction) => {
    const next = reduceProjectSession(sessionRef.current, action)
    sessionRef.current = next
    setTurns(next.turns as LandingTurn[])
    setHtml(expandProjectImageUrls(next.html))
    setTitle(next.title)
    setModelsState(resolveLandingModels(next.models))
    const running =
      next.run.status === 'running' ||
      next.run.blocked ||
      Object.keys(next.pending).length > 0
    setIsStreaming(running)
    sendingRef.current = running
    return next
  }, [])

  const patchTurn = useCallback(
    (turnId: string, fn: (turn: LandingTurn) => LandingTurn) => {
      const update = (prev: LandingTurn[]) =>
        prev.map((turn) => (turn.id === turnId ? fn(turn) : turn))
      sessionRef.current = {
        ...sessionRef.current,
        turns: update(sessionRef.current.turns as LandingTurn[]),
      }
      setTurns(update)
    },
    [],
  )

  const finalizeActiveRun = useCallback(() => {
    setIsStreaming(false)
    setIsStopping(false)
    sendingRef.current = false
    stoppingRef.current = false
    if (stopSafetyRef.current !== null) {
      window.clearTimeout(stopSafetyRef.current)
      stopSafetyRef.current = null
    }
  }, [])

  // Subscribe to the project's live event stream on mount (and when switching
  // projects). The server sends a `state` snapshot first (current HTML, models,
  // status, live-replayed turns), then tails run events as they happen — so a
  // tab reopened mid-run sees live progress instead of a frozen snapshot.
  useEffect(() => {
    if (sessionRef.current.projectId !== projectId) {
      sessionRef.current = createProjectSession(projectId)
      retriedUnknownTurns.current.clear()
      mountedGeneration.current += 1
    }
    const generation = mountedGeneration.current
    setMissing(false)
    setConnection('connecting')
    connectionRef.current = 'connecting'
    const controller = new AbortController()

    void subscribeWithRecovery(projectEventsUrl(projectId), {
      onEvent: ({ data, event }) => {
        if (generation !== mountedGeneration.current) return
        if (event === 'protocol_error') {
          const message = ProtocolErrorSchema.parse(data).message
          onError(message)
          applySession({
            connection: 'unavailable',
            reason: message,
            type: 'connection',
          })
          return
        }
        if (event === 'state') {
          const state = parseProjectSnapshot(data)
          const next = applySession({ snapshot: state, type: 'snapshot' })
          setIsStopping(false)
          for (const turn of state.turns) {
            if (!turn.isStreaming && !turn.error && !turn.stopped)
              void deleteDraft(`${projectId}:turn:${turn.id}`).catch(() => {})
          }
          const streaming =
            state.run.status === 'running' ||
            state.run.blocked ||
            Object.keys(next.pending).length > 0
          stoppingRef.current = false
          if (!streaming) finalizeActiveRun()
          const uncertain = Object.values(next.pending).find(
            (pending) => pending.outcome === 'unknown',
          )
          if (
            uncertain?.input.turnId &&
            state.run.status !== 'running' &&
            !state.run.blocked &&
            !retriedUnknownTurns.current.has(uncertain.input.turnId)
          ) {
            const retryTurnId = uncertain.input.turnId
            const retryGeneration = mountedGeneration.current
            const retryLifetime = mountedLifetime.current
            retriedUnknownTurns.current.add(retryTurnId)
            void sendPrompt(uncertain.input).then(
              (result) => {
                if (
                  retryGeneration !== mountedGeneration.current ||
                  retryLifetime !== mountedLifetime.current ||
                  projectId !== sessionRef.current.projectId
                )
                  return
                const reconciled = sessionRef.current.accepted[retryTurnId]
                  ? { outcome: 'accepted' as const, turnId: retryTurnId }
                  : { ...result, turnId: retryTurnId }
                const settled = applySession({
                  result: reconciled,
                  type: 'submission_result',
                })
                if (
                  reconciled.outcome === 'rejected' &&
                  !isSessionActive(settled)
                )
                  finalizeActiveRun()
              },
              (error: unknown) => {
                if (
                  retryGeneration === mountedGeneration.current &&
                  retryLifetime === mountedLifetime.current &&
                  projectId === sessionRef.current.projectId
                )
                  applySession({
                    result: {
                      outcome: 'unknown',
                      reason:
                        error instanceof Error ? error.message : String(error),
                      turnId: retryTurnId,
                    },
                    type: 'submission_result',
                  })
              },
            )
          }
          return
        }
        if (event !== 'project_event') return
        const parsed = ProjectEventSchema.parse(data)
        if (parsed.projectId !== projectId) return
        const next = applySession({ event: parsed, type: 'event' })
        if (next.needsSnapshot) {
          reconnect()
          return
        }
        if (parsed.type === 'run_accepted') return
        if (parsed.type === 'run_blocked') {
          return
        }
        if (parsed.type === 'run_terminal') {
          if (parsed.payload.outcome === 'completed') {
            void deleteDraft(`${projectId}:turn:${parsed.turnId}`).catch(
              () => {},
            )
          }
          if (
            next.run.turnId === parsed.turnId &&
            next.run.status !== 'running' &&
            !next.run.blocked &&
            Object.keys(next.pending).length === 0
          )
            finalizeActiveRun()
        }
      },
      onMissing: () => setMissing(true),
      onStatus: (value, reason) => {
        const displayed = displayConnection(value)
        setConnection(displayed)
        connectionRef.current = displayed
        if (value === 'unavailable' && reason) onError(reason)
        applySession({
          connection: value,
          ...(value === 'unavailable'
            ? { reason: reason ?? 'The project stream is unavailable.' }
            : {}),
          type: 'connection',
        })
      },
      signal: controller.signal,
    })

    return () => {
      controller.abort()
      if (stopSafetyRef.current !== null) {
        window.clearTimeout(stopSafetyRef.current)
        stopSafetyRef.current = null
      }
    }
  }, [
    applySession,
    finalizeActiveRun,
    onError,
    projectId,
    reconnect,
    reconnectKey,
  ])

  const persistModels = useCallback(
    (nextModels: LandingModels) => {
      setModelsState(nextModels)
      const saveSeq = ++modelSaveSeq.current
      const generation = mountedGeneration.current
      const lifetime = mountedLifetime.current

      void updateProjectModels(projectId, nextModels)
        .then(() => {
          if (
            generation === mountedGeneration.current &&
            lifetime === mountedLifetime.current &&
            saveSeq === modelSaveSeq.current
          ) {
            setModelsState(nextModels)
          }
        })
        .catch((err: unknown) => {
          if (
            generation !== mountedGeneration.current ||
            lifetime !== mountedLifetime.current ||
            saveSeq !== modelSaveSeq.current
          )
            return
          if (err instanceof ProjectNotFoundError) {
            setMissing(true)
            return
          }
          onError(
            err instanceof Error
              ? err.message
              : 'Failed to update project models',
          )
        })
    },
    [onError, projectId],
  )

  const send = useCallback(
    async ({ attachments = [], prompt }: LandingAgentSendInput) => {
      const existing = Object.values(sessionRef.current.pending).find(
        (pending) => pending.outcome === 'unknown',
      )
      if (existing) {
        if (
          connectionRef.current !== 'live' ||
          !sameSubmittedDraft(existing.input, { attachments, prompt })
        )
          return {
            outcome: 'rejected' as const,
            reason:
              'The previous submission is still being reconciled. Restore that draft before retrying.',
            turnId: existing.input.turnId ?? '',
          }
        return submit(existing.input)
      }
      if (isStreaming || sendingRef.current || connectionRef.current !== 'live')
        return {
          outcome: 'rejected' as const,
          reason: 'The editor is not ready to submit.',
          turnId: '',
        }

      const turnId = nextTurnId()
      const attachmentMetadata = attachments.map(stripAttachmentData)
      const turn: LandingTurn = {
        attachments: attachmentMetadata,
        htmlSwaps: 0,
        id: turnId,
        isStreaming: true,
        model: models.text,
        parts: [],
        prompt,
        startedAt: Date.now(),
      }
      const command = {
        attachments: attachments.map(toWireAttachment),
        compactionPercent,
        imageModel: models.image,
        projectId,
        prompt,
        textModel: models.text,
        turnId,
        visionModel: models.vision,
      } as const
      applySession({ input: command, turn, type: 'submitted' })

      void saveDraft(`${projectId}:turn:${turnId}`, {
        attachments,
        prompt,
      }).catch(() => {})
      return submit(command)

      async function submit(commandToSend: Readonly<StartRunCommand>) {
        if (!commandToSend.turnId)
          throw new Error('A pending submission must have a turn ID.')
        const generation = mountedGeneration.current
        const lifetime = mountedLifetime.current
        try {
          const result = await sendPrompt(commandToSend)
          if (
            generation !== mountedGeneration.current ||
            lifetime !== mountedLifetime.current ||
            projectId !== sessionRef.current.projectId
          ) {
            return { outcome: 'unknown' as const, turnId: commandToSend.turnId }
          }
          const observedAccepted =
            sessionRef.current.accepted[commandToSend.turnId] === true
          const reconciled = observedAccepted
            ? { outcome: 'accepted' as const, turnId: commandToSend.turnId }
            : { ...result, turnId: commandToSend.turnId }
          const settled = applySession({
            result: reconciled,
            type: 'submission_result',
          })
          if (reconciled.outcome === 'rejected' && !isSessionActive(settled))
            finalizeActiveRun()
          if (reconciled.outcome === 'unknown') reconnect()
          return reconciled
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error)
          const result = {
            outcome: 'unknown' as const,
            reason: message,
            turnId: commandToSend.turnId,
          }
          if (
            generation === mountedGeneration.current &&
            lifetime === mountedLifetime.current &&
            projectId === sessionRef.current.projectId
          ) {
            applySession({ result, type: 'submission_result' })
            reconnect()
          }
          return result
        }
      }
    },
    [
      compactionPercent,
      applySession,
      finalizeActiveRun,
      isStreaming,
      models,
      projectId,
      reconnect,
    ],
  )

  const stop = useCallback(() => {
    if (!sendingRef.current || stoppingRef.current) return
    stoppingRef.current = true
    setIsStopping(true)
    // Immediate visual feedback: terminalize still-running tools on the active
    // turn + stop its part animations. The panel-level `isStreaming` stays true
    // until the subscribe stream delivers the terminal `error`/`done`, so a new
    // send stays blocked while the server flushes the terminal cost/stats.
    const turnId = sessionRef.current.run.turnId
    if (turnId) {
      patchTurn(turnId, (turn) => ({
        ...terminalizeTools(turn, 'Stopped.'),
        isStreaming: false,
        stopped: true,
      }))
    }
    // Ask the server to abort its Mastra stream; the subscribe stream delivers
    // the terminal stats + `done` (do NOT abort the subscribe connection).
    const generation = mountedGeneration.current
    const lifetime = mountedLifetime.current
    void stopProjectAgent(projectId).catch(() => {
      if (
        generation !== mountedGeneration.current ||
        lifetime !== mountedLifetime.current ||
        projectId !== sessionRef.current.projectId
      )
        return
      stoppingRef.current = false
      setIsStopping(false)
      onError(
        'Could not confirm the stop. Reconnecting to check the run; you can stop it again.',
      )
      reconnect()
    })
    stopSafetyRef.current = window.setTimeout(() => {
      if (
        generation === mountedGeneration.current &&
        lifetime === mountedLifetime.current &&
        projectId === sessionRef.current.projectId
      )
        reconnect()
    }, STOP_SAFETY_MS)
  }, [onError, patchTurn, projectId, reconnect])

  const setCompactionPercent = useCallback((percent: number) => {
    const clamped = Math.min(100, Math.max(1, Math.round(percent)))
    setCompactionPercentState(clamped)
    try {
      window.localStorage.setItem(
        COMPACTION_PERCENT_STORAGE_KEY,
        String(clamped),
      )
    } catch {
      // Persistence is best-effort; the in-memory value still applies.
    }
  }, [])

  return {
    compactionPercent,
    connection,
    html,
    isStopping,
    isStreaming,
    missing,
    models,
    reconnect,
    send,
    setCompactionPercent,
    setModels: persistModels,
    setTitle,
    stop,
    title,
    turns,
  }
}

function displayConnection(value: TransportConnectionStatus): ConnectionStatus {
  if (value === 'connected') return 'live'
  if (value === 'unavailable') return 'offline'
  return value
}

function isSessionActive(state: ReturnType<typeof createProjectSession>) {
  return (
    state.run.status === 'running' ||
    state.run.blocked ||
    Object.keys(state.pending).length > 0
  )
}

/** Read the persisted autocompaction threshold (percent of context window). */
function readStoredCompactionPercent(): number {
  try {
    const raw = window.localStorage.getItem(COMPACTION_PERCENT_STORAGE_KEY)
    const value = raw == null ? Number.NaN : Number(raw)
    if (!Number.isFinite(value)) return DEFAULT_COMPACTION_PERCENT
    return Math.min(100, Math.max(1, Math.round(value)))
  } catch {
    return DEFAULT_COMPACTION_PERCENT
  }
}

function sameSubmittedDraft(
  command: Readonly<StartRunCommand>,
  input: LandingAgentSendInput,
): boolean {
  return (
    command.prompt === input.prompt &&
    JSON.stringify(command.attachments ?? []) ===
      JSON.stringify((input.attachments ?? []).map(toWireAttachment))
  )
}

function stripAttachmentData(
  attachment: PromptAttachmentInput,
): PromptAttachmentMeta {
  if (attachment.kind === 'element') return attachment
  const { dataUrl: _dataUrl, ...metadata } = attachment
  return metadata
}

/** Map local UI attachment metadata to the server wire format. Elements send
 *  only `{ kind, selector }`; uploaded images send their full payload + dataUrl. */
function toWireAttachment(attachment: PromptAttachmentInput) {
  if (attachment.kind === 'element') {
    return { kind: 'element' as const, selector: attachment.selector }
  }
  return {
    dataUrl: attachment.dataUrl,
    id: attachment.id,
    mediaType: attachment.mediaType,
    name: attachment.name,
    size: attachment.size,
  }
}
