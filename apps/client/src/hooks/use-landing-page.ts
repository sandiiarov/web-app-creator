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
  stopProjectAgent,
  updateProjectModels,
  type Project,
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

const RECONCILIATION_DELAYS_MS = [0, 100, 300, 1000] as const

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
  const stoppingRef = useRef(false)
  const stopSafetyRef = useRef<null | number>(null)
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
      if (isStreaming || controllerRef.current !== null) return

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

      let receivedDone = false
      void streamSSE(
        LANDING_AGENT_API,
        {
          attachments,
          imageModel: models.image,
          projectId,
          prompt,
          textModel: models.text,
          turnId,
          visionModel: models.vision,
        },
        {
          onEvent: ({ data, event }) => {
            if (event === 'done') receivedDone = true
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
                payload: withAnalyzeImageArgs(data, event, attachments),
                ts: '',
              }),
            )
          },
          signal: controller.signal,
        },
      )
        .then(() => {
          if (!receivedDone) {
            throw new Error('Agent stream ended before terminal done event.')
          }
        })
        .catch(async (error: unknown) => {
          const reconciled = await reconcilePersistedTurn(projectId, turnId)
          if (reconciled) {
            setHtml(expandProjectImageUrls(reconciled.project.indexHtml))
            setTurns((prev) =>
              prev.map((turn) => (turn.id === turnId ? reconciled.turn : turn)),
            )
            return
          }

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
          stoppingRef.current = false
          if (stopSafetyRef.current !== null) {
            window.clearTimeout(stopSafetyRef.current)
            stopSafetyRef.current = null
          }
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
    const controller = controllerRef.current
    if (!controller || stoppingRef.current) return
    stoppingRef.current = true
    // Immediate visual feedback: terminalize still-running tools on the active
    // turn and stop its part animations. The panel-level `isStreaming` stays
    // true until the stream actually closes, so a new send stays blocked while
    // the server flushes the terminal cost/stats for this run.
    setTurns((prev) =>
      prev.map((turn) =>
        turn.isStreaming
          ? {
              ...terminalizeTools(turn, 'Stopped.'),
              isStreaming: false,
              stopped: true,
            }
          : turn,
      ),
    )
    // Graceful stop: ask the server to abort its Mastra stream WITHOUT closing
    // the SSE response, then keep reading so the final stats + `done` arrive
    // and the Spend / tokens block renders for a stopped run. Do NOT abort the
    // fetch here — that would close the connection and drop the terminal stats.
    void stopProjectAgent(projectId).catch(() => {
      // Endpoint failed (server down / already finished): fall back to a hard
      // abort so the UI does not wait on a stream that will not close.
      controller.abort()
    })
    // Safety: if the server does not close the stream promptly (e.g. stuck on
    // a slow tool), force-abort. Stats may be lost in that degraded case.
    stopSafetyRef.current = window.setTimeout(() => controller.abort(), 8000)
  }, [projectId])

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

async function reconcilePersistedTurn(
  projectId: string,
  turnId: string,
): Promise<null | { project: Project; turn: LandingTurn }> {
  for (const delayMs of RECONCILIATION_DELAYS_MS) {
    if (delayMs > 0) await wait(delayMs)
    try {
      const project = await getProject(projectId)
      const persisted = project.messages.find((turn) => turn.id === turnId)
      if (persisted && !persisted.isStreaming) {
        return {
          project,
          turn: restoreProjectTurns([persisted])[0]!,
        }
      }
    } catch {
      // The next bounded attempt may observe the server's final log flush.
    }
  }
  return null
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

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, delayMs))
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
    data.tool !== 'analyze_image' ||
    attachments.length === 0
  ) {
    return data
  }

  return {
    ...data,
    images: attachments.map((attachment) => ({
      alt: attachment.name,
      url: attachment.dataUrl,
    })),
  }
}
