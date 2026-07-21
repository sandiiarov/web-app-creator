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
import {
  type AgentEventSubscription,
  ProjectNotFoundError,
  expandProjectImageUrls,
  projectEventsUrl,
  sendPrompt,
  stopProjectAgent,
  updateProjectModels,
} from '../lib/projects-api'
import { streamSSEGet } from '../lib/sse-client'

export interface UseLandingPage {
  html: string
  isStreaming: boolean
  missing: boolean
  models: LandingModels
  send: (input: LandingAgentSendInput) => void
  setModels: (models: LandingModels) => void
  stop: () => void
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
  const [models, setModelsState] = useState<LandingModels>(
    DEFAULT_LANDING_MODELS,
  )
  const [isStreaming, setIsStreaming] = useState(false)
  const [missing, setMissing] = useState(false)

  // Synchronous send lock (two sends in one render tick must not both fire).
  const sendingRef = useRef(false)
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

  // Subscribe to the project's live event stream on mount (and when switching
  // projects). The server sends a `state` snapshot first (current HTML, models,
  // status, live-replayed turns), then tails run events as they happen — so a
  // tab reopened mid-run sees live progress instead of a frozen snapshot.
  useEffect(() => {
    setMissing(false)
    setHtml('')
    setTurns([])
    setIsStreaming(false)
    sendingRef.current = false
    activeTurnIdRef.current = null
    pendingAttachmentsRef.current = []

    const controller = new AbortController()

    void streamSSEGet(projectEventsUrl(projectId), {
      onEvent: ({ data, event }) => {
        if (event === 'state') {
          const state = data as AgentEventSubscription
          setHtml(expandProjectImageUrls(state.html))
          // Live-replayed turns keep an in-flight turn `isStreaming` so the UI
          // shows it as active; do NOT force-finalize on hydrate.
          setTurns(restoreTurnsFromState(state.turns))
          setModelsState(
            resolveLandingModels({
              image: state.models.image,
              text: state.models.text,
              vision: state.models.vision,
            }),
          )
          const streaming = state.status === 'running'
          setIsStreaming(streaming)
          sendingRef.current = streaming
          stoppingRef.current = false
          activeTurnIdRef.current = streaming
            ? (lastStreamingTurnId(state.turns) ?? null)
            : null
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

        if (event === 'done' || event === 'error') {
          finalizeActiveRun()
        }
      },
      signal: controller.signal,
    }).catch((err: unknown) => {
      if (controller.signal.aborted) return
      if (err instanceof Error && /404/.test(err.message)) {
        setMissing(true)
        return
      }
      onError(
        err instanceof Error ? err.message : 'Failed to open event stream',
      )
    })

    return () => {
      controller.abort()
      if (stopSafetyRef.current !== null) {
        window.clearTimeout(stopSafetyRef.current)
        stopSafetyRef.current = null
      }
    }
  }, [onError, projectId])

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
    sendingRef.current = false
    stoppingRef.current = false
    activeTurnIdRef.current = null
    pendingAttachmentsRef.current = []
    if (stopSafetyRef.current !== null) {
      window.clearTimeout(stopSafetyRef.current)
      stopSafetyRef.current = null
    }
  }, [])

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
    ({ attachments = [], prompt }: LandingAgentSendInput) => {
      if (isStreaming || sendingRef.current) return

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
      setTurns((prev) => [...prev, turn])
      setIsStreaming(true)
      sendingRef.current = true
      activeTurnIdRef.current = turnId
      pendingAttachmentsRef.current = attachments

      void sendPrompt({
        attachments: attachments.map(toWireAttachment),
        imageModel: models.image,
        projectId,
        prompt,
        textModel: models.text,
        turnId,
        visionModel: models.vision,
      }).catch((error: unknown) => {
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
      })
    },
    [finalizeActiveRun, isStreaming, models, patchTurn, projectId],
  )

  const stop = useCallback(() => {
    if (!sendingRef.current || stoppingRef.current) return
    stoppingRef.current = true
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
      // Endpoint failed: force-finalize locally so the UI doesn't wait.
      finalizeActiveRun()
    })
    // Safety: if the server doesn't deliver a terminal event promptly, reset
    // local streaming state so the panel isn't stuck.
    stopSafetyRef.current = window.setTimeout(() => {
      finalizeActiveRun()
    }, STOP_SAFETY_MS)
  }, [finalizeActiveRun, patchTurn, projectId])

  return {
    html,
    isStreaming,
    missing,
    models,
    send,
    setModels: persistModels,
    stop,
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
