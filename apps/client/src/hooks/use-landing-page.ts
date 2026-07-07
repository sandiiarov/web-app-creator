import { applyEventToTurn, terminalizeTools } from '@workspace/conversation'
import { captureProjectScreenshot } from '@workspace/landing-preview'
import {
  DEFAULT_LANDING_MODELS,
  type LandingAgentSendInput,
  type LandingModels,
  type LandingTurn,
  type PromptAttachmentInput,
  type PromptAttachmentMeta,
  resolveLandingModels,
  type TurnPart,
} from '@workspace/prompt-panel'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  LANDING_AGENT_API,
  type HtmlUpdateEvent,
  type RetryEvent,
  type ScreenshotRequestEvent,
} from '../lib/landing-agent'
import {
  ProjectNotFoundError,
  expandProjectImageUrls,
  getProject,
  postScreenshotResponse,
  updateProjectModels,
} from '../lib/projects-api'
import { streamSSE } from '../lib/sse-client'

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
  const controllerRef = useRef<AbortController | null>(null)
  const modelSaveSeq = useRef(0)

  // Load the project on mount (and when switching projects): the server owns
  // the HTML, so the UI pulls it rather than holding its own canonical copy.
  useEffect(() => {
    let cancelled = false
    setMissing(false)
    setHtml('')
    setTurns([])

    void getProject(projectId)
      .then((project) => {
        if (cancelled) return
        setHtml(expandProjectImageUrls(project.indexHtml))
        setTurns(restoreProjectTurns(project.messages))
        setModelsState(
          resolveLandingModels({
            image: project.imageModel,
            text: project.model,
            vision: project.visionModel,
          }),
        )
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (err instanceof ProjectNotFoundError) setMissing(true)
        else
          onError(err instanceof Error ? err.message : 'Failed to load project')
      })

    return () => {
      cancelled = true
    }
  }, [projectId, onError])

  const patchTurn = useCallback(
    (turnId: string, fn: (turn: LandingTurn) => LandingTurn) => {
      setTurns((prev) =>
        prev.map((turn) => (turn.id === turnId ? fn(turn) : turn)),
      )
    },
    [],
  )

  const appendPart = useCallback(
    (turnId: string, part: TurnPart) => {
      patchTurn(turnId, (turn) => ({
        ...turn,
        parts: [...turn.parts, part],
      }))
    },
    [patchTurn],
  )

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

  const respondToScreenshotRequest = useCallback(
    async (event: ScreenshotRequestEvent) => {
      try {
        if (event.projectId !== projectId) {
          throw new Error('Screenshot request targeted a different project.')
        }
        const project = await getProject(event.projectId)
        const screenshot = await captureProjectScreenshot({
          html: expandProjectImageUrls(project.indexHtml),
          selector: event.selector,
          viewportSize: event.viewportSize,
        })
        await postScreenshotResponse(event.requestId, screenshot)
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Browser screenshot capture failed.'
        await postScreenshotResponse(event.requestId, { error: message }).catch(
          () => undefined,
        )
      }
    },
    [projectId],
  )

  const send = useCallback(
    ({ attachments = [], prompt }: LandingAgentSendInput) => {
      if (isStreaming) return

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

      const controller = new AbortController()
      controllerRef.current = controller

      void streamSSE(
        LANDING_AGENT_API,
        {
          attachments,
          imageModel: models.image,
          projectId,
          prompt,
          textModel: models.text,
          visionModel: models.vision,
        },
        {
          onEvent: ({ data, event }) => {
            // Side-effect events have no turn-structure effect and stay
            // client-local; structural events share the reducer with the
            // server's hydration path (@workspace/conversation).
            if (event === 'html_update') {
              const update = data as HtmlUpdateEvent
              if (update.projectId === projectId) {
                setHtml(expandProjectImageUrls(update.html))
              }
              return
            }
            if (event === 'screenshot_request') {
              void respondToScreenshotRequest(data as ScreenshotRequestEvent)
              return
            }
            if (event === 'retry') {
              const retry = data as RetryEvent
              appendPart(turnId, {
                ...retry,
                id: `${turnId}-retry-${retry.attempt}`,
                startedAt: Date.now(),
                type: 'retry',
              })
              return
            }
            patchTurn(turnId, (turn) =>
              applyEventToTurn(turn, {
                dir: 'out',
                event,
                payload: data,
                ts: '',
              }),
            )
          },
          signal: controller.signal,
        },
      )
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error)
          if (message !== 'stopped' && !controller.signal.aborted) {
            patchTurn(turnId, (turn) =>
              applyEventToTurn(turn, {
                dir: 'out',
                event: 'error',
                payload: { message },
                ts: '',
              }),
            )
          }
        })
        .finally(() => {
          patchTurn(turnId, (turn) =>
            applyEventToTurn(turn, {
              dir: 'out',
              event: 'done',
              payload: {},
              ts: '',
            }),
          )
          setIsStreaming(false)
          controllerRef.current = null
        })
    },
    [
      appendPart,
      isStreaming,
      models,
      patchTurn,
      projectId,
      respondToScreenshotRequest,
    ],
  )

  const stop = useCallback(() => {
    controllerRef.current?.abort()
    setIsStreaming(false)
    setTurns((prev) =>
      prev.map((turn) =>
        turn.isStreaming
          ? { ...terminalizeTools(turn, 'Stopped.'), isStreaming: false }
          : turn,
      ),
    )
  }, [])

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

function restoreProjectTurns(turns: LandingTurn[]): LandingTurn[] {
  return turns.map((turn) => {
    const restored = terminalizeTools({
      ...turn,
      parts: turn.parts ?? [],
    })
    return {
      ...restored,
      attachments: turn.attachments ?? [],
      htmlSwaps: turn.htmlSwaps ?? 0,
      isStreaming: false,
    }
  })
}

function stripAttachmentData({
  dataUrl: _dataUrl,
  ...metadata
}: PromptAttachmentInput): PromptAttachmentMeta {
  return metadata
}
