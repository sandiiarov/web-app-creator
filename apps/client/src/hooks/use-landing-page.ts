import { applyEventToTurn, terminalizeTools } from '@workspace/conversation'
import {
  DEFAULT_LANDING_MODELS,
  type LandingAgentSendInput,
  type LandingModels,
  type LandingTurn,
  type PromptAttachmentInput,
  type PromptAttachmentMeta,
  resolveLandingModels,
} from '@workspace/prompt-panel'
import { useCallback, useEffect, useRef, useState } from 'react'

import { type HtmlUpdateEvent, type RetryEvent } from '../lib/landing-agent'
import { deleteDraft, saveDraft } from '../lib/project-drafts'
import {
  type AgentEventSubscription,
  ProjectNotFoundError,
  expandProjectImageUrls,
  projectEventsUrl,
  sendPrompt,
  stopProjectAgent,
  updateProjectModels,
} from '../lib/projects-api'
import {
  subscribeWithRecovery,
  type ConnectionStatus,
} from '../lib/reconnecting-stream'

export interface UseLandingPage {
  connection: ConnectionStatus
  html: string
  isStopping: boolean
  isStreaming: boolean
  missing: boolean
  models: LandingModels
  reconnect: () => void
  send: (input: LandingAgentSendInput) => Promise<boolean>
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

const STOP_SAFETY_MS = 8000

let turnSeq = 0
const nextTurnId = () => `turn-${Date.now()}-${turnSeq++}`

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
  const [isStreaming, setIsStreaming] = useState(false)
  const [missing, setMissing] = useState(false)

  // Synchronous send lock (two sends in one render tick must not both fire).
  const sendingRef = useRef(false)
  const pendingPostRef = useRef<LandingTurn | null>(null)
  const failedRunRef = useRef(false)
  // The turn id live events currently target (the active run's turn). Null when
  // no run is streaming.
  const activeTurnIdRef = useRef<null | string>(null)
  // Attachments from the in-flight send, used to enrich `analyze_image` tool
  // diagnostics with the uploaded image data URLs (which never round-trip
  // through the durable event log).
  const pendingAttachmentsRef = useRef<PromptAttachmentInput[]>([])
  const stoppingRef = useRef(false)
  const stopSafetyRef = useRef<null | number>(null)
  const modelSaveSeq = useRef(0)

  const patchTurn = useCallback(
    (turnId: string, fn: (turn: LandingTurn) => LandingTurn) => {
      setTurns((prev) =>
        prev.map((turn) => (turn.id === turnId ? fn(turn) : turn)),
      )
    },
    [],
  )

  const finalizeActiveRun = useCallback(() => {
    setIsStreaming(false)
    setIsStopping(false)
    sendingRef.current = false
    stoppingRef.current = false
    activeTurnIdRef.current = null
    pendingAttachmentsRef.current = []
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
    setMissing(false)
    setConnection('connecting')
    connectionRef.current = 'connecting'
    const controller = new AbortController()

    void subscribeWithRecovery(projectEventsUrl(projectId), {
      onEvent: ({ data, event }) => {
        if (event === 'state') {
          const state = data as AgentEventSubscription
          setHtml(expandProjectImageUrls(state.html))
          setTitle(state.title ?? 'Untitled')
          setIsStopping(false)
          // Live-replayed turns keep an in-flight turn `isStreaming` so the UI
          // shows it as active; do NOT force-finalize on hydrate.
          const pending = pendingPostRef.current
          const restored = restoreTurnsFromState(state.turns)
          setTurns(
            pending && !restored.some((turn) => turn.id === pending.id)
              ? [...restored, pending]
              : restored,
          )
          failedRunRef.current =
            state.status === 'error' ||
            state.status === 'stopped' ||
            state.status === 'interrupted'
          for (const turn of restored) {
            if (!turn.isStreaming && !turn.error && !turn.stopped)
              void deleteDraft(`${projectId}:turn:${turn.id}`).catch(() => {})
          }
          setModelsState(
            resolveLandingModels({
              image: state.models.image,
              text: state.models.text,
              vision: state.models.vision,
            }),
          )
          const streaming = state.status === 'running' || !!pending
          setIsStreaming(streaming)
          sendingRef.current = streaming
          stoppingRef.current = false
          activeTurnIdRef.current = streaming
            ? (lastStreamingTurnId(state.turns) ?? pending?.id ?? null)
            : null
          return
        }

        if (event === 'project_meta') {
          setTitle((data as { title: string }).title)
          return
        }

        if (event === 'html_update') {
          const update = data as HtmlUpdateEvent
          if (update.projectId === projectId) {
            setHtml(expandProjectImageUrls(update.html))
          }
          return
        }

        const turnId = activeTurnIdRef.current
        if (!turnId) return

        if (event === 'retry') {
          const retry = data as RetryEvent
          patchTurn(turnId, (turn) => ({
            ...turn,
            parts: [
              ...turn.parts,
              {
                ...retry,
                id: `${turnId}-retry-${retry.attempt}`,
                startedAt: Date.now(),
                type: 'retry',
              },
            ],
          }))
          return
        }

        patchTurn(turnId, (turn) =>
          applyEventToTurn(turn, {
            dir: 'out',
            event,
            payload: withAnalyzeImageArgs(
              data,
              event,
              pendingAttachmentsRef.current,
            ),
            ts: '',
          }),
        )

        if (event === 'error') failedRunRef.current = true
        if (event === 'done') {
          if (!failedRunRef.current)
            void deleteDraft(`${projectId}:turn:${turnId}`).catch(() => {})
          finalizeActiveRun()
        }
      },
      onMissing: () => setMissing(true),
      onStatus: (value) => {
        setConnection(value)
        connectionRef.current = value
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
  }, [finalizeActiveRun, patchTurn, projectId, reconnectKey])

  const persistModels = useCallback(
    (nextModels: LandingModels) => {
      setModelsState(nextModels)
      const saveSeq = ++modelSaveSeq.current

      void updateProjectModels(projectId, nextModels)
        .then(() => {
          if (saveSeq === modelSaveSeq.current) {
            setModelsState(nextModels)
          }
        })
        .catch((err: unknown) => {
          if (saveSeq !== modelSaveSeq.current) return
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
      if (isStreaming || sendingRef.current || connectionRef.current !== 'live')
        return false

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
      }
      pendingPostRef.current = turn
      failedRunRef.current = false
      setTurns((prev) => [...prev, turn])
      setIsStreaming(true)
      sendingRef.current = true
      activeTurnIdRef.current = turnId
      pendingAttachmentsRef.current = attachments

      void saveDraft(`${projectId}:turn:${turnId}`, {
        attachments,
        prompt,
      }).catch(() => {})
      try {
        await sendPrompt({
          attachments: attachments.map(toWireAttachment),
          imageModel: models.image,
          projectId,
          prompt,
          textModel: models.text,
          turnId,
          visionModel: models.vision,
        })
        return true
      } catch (error: unknown) {
        // The server rejected the run (e.g. 409 overlap, validation, or it was
        // deleted). Roll back the optimistic turn to a terminal error state.
        const message = error instanceof Error ? error.message : String(error)
        patchTurn(turnId, (current) =>
          applyEventToTurn(
            { ...current, isStreaming: false },
            { dir: 'out', event: 'error', payload: { message }, ts: '' },
          ),
        )
        finalizeActiveRun()
        return false
      } finally {
        pendingPostRef.current = null
      }
    },
    [finalizeActiveRun, isStreaming, models, patchTurn, projectId],
  )

  const stop = useCallback(() => {
    if (!sendingRef.current || stoppingRef.current) return
    failedRunRef.current = true
    stoppingRef.current = true
    setIsStopping(true)
    // Immediate visual feedback: terminalize still-running tools on the active
    // turn + stop its part animations. The panel-level `isStreaming` stays true
    // until the subscribe stream delivers the terminal `error`/`done`, so a new
    // send stays blocked while the server flushes the terminal cost/stats.
    const turnId = activeTurnIdRef.current
    if (turnId) {
      patchTurn(turnId, (turn) => ({
        ...terminalizeTools(turn, 'Stopped.'),
        isStreaming: false,
        stopped: true,
      }))
    }
    // Ask the server to abort its Mastra stream; the subscribe stream delivers
    // the terminal stats + `done` (do NOT abort the subscribe connection).
    void stopProjectAgent(projectId).catch(() => {
      stoppingRef.current = false
      setIsStopping(false)
      onError(
        'Could not confirm the stop. Reconnecting to check the run; you can stop it again.',
      )
      reconnect()
    })
    stopSafetyRef.current = window.setTimeout(() => {
      reconnect()
    }, STOP_SAFETY_MS)
  }, [onError, patchTurn, projectId, reconnect])

  return {
    connection,
    html,
    isStopping,
    isStreaming,
    missing,
    models,
    reconnect,
    send,
    setModels: persistModels,
    setTitle,
    stop,
    title,
    turns,
  }
}

function lastStreamingTurnId(turns: LandingTurn[]): string | undefined {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    if (turns[index]?.isStreaming) return turns[index]?.id
  }
  return undefined
}

/** Restore turns delivered by the `state` snapshot. Unlike a reload of a
 *  finished project, an in-flight turn stays `isStreaming` (live-replayed); we
 *  only normalize optional attachment/part fields. */
function restoreTurnsFromState(turns: LandingTurn[]): LandingTurn[] {
  return turns.map((turn) => ({
    ...turn,
    attachments: turn.attachments ?? [],
    parts: turn.parts ?? [],
  }))
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

function withAnalyzeImageArgs(
  data: unknown,
  event: string,
  attachments: PromptAttachmentInput[],
) {
  if (
    event !== 'tool_call' ||
    !data ||
    typeof data !== 'object' ||
    !('tool' in data) ||
    data.tool !== 'analyze_image'
  ) {
    return data
  }

  // Only uploaded images carry a dataUrl to enrich the display with.
  // Element captures produce safe persisted URLs on the server side.
  const imageAttachments = attachments.filter(
    (attachment): attachment is PromptAttachmentInput & { dataUrl: string } =>
      attachment.kind !== 'element' && 'dataUrl' in attachment,
  )
  if (imageAttachments.length === 0) return data

  const serverImages =
    'images' in data && Array.isArray(data.images) ? data.images : []

  return {
    ...data,
    images: [
      ...imageAttachments.map((attachment) => ({
        alt: attachment.name,
        url: attachment.dataUrl,
      })),
      ...serverImages,
    ],
  }
}
