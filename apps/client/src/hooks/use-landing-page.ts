import { useCallback, useEffect, useRef, useState } from 'react'

import { captureProjectScreenshot } from '../lib/browser-screenshot'
import {
  LANDING_AGENT_API,
  LANDING_MODEL_OPTIONS,
  type HtmlUpdateEvent,
  type ImageAttachmentInput,
  type ImageAttachmentMeta,
  type LandingAgentSendInput,
  type LandingTurn,
  type RetryEvent,
  type ScreenshotRequestEvent,
  type ToolCallPart,
  type TurnPart,
} from '../lib/landing-agent'
import {
  ProjectNotFoundError,
  expandProjectImageUrls,
  getProject,
  postScreenshotResponse,
  updateProjectModel,
} from '../lib/projects-api'
import { streamSSE } from '../lib/sse-client'

export interface UseLandingPage {
  html: string
  isStreaming: boolean
  missing: boolean
  model: string
  send: (input: LandingAgentSendInput) => void
  setModel: (model: string) => void
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
  const [model, setSelectedModel] = useState(LANDING_MODEL_OPTIONS[0]!.id)
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
        if (project.model) setSelectedModel(project.model)
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

  const persistModel = useCallback(
    (nextModel: string) => {
      setSelectedModel(nextModel)
      const saveSeq = ++modelSaveSeq.current

      void updateProjectModel(projectId, nextModel)
        .then((project) => {
          if (saveSeq === modelSaveSeq.current) {
            setSelectedModel(project.model || nextModel)
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
              : 'Failed to update project model',
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
          height: event.height,
          html: expandProjectImageUrls(project.indexHtml),
          width: event.width,
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
        model,
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
          model,
          projectId,
          prompt,
        },
        {
          onEvent: ({ data, event }) => {
            switch (event) {
              case 'done': {
                patchTurn(turnId, (turn) => ({
                  ...terminalizeActiveTools(turn),
                  isStreaming: false,
                }))
                break
              }
              case 'error': {
                const { message } = data as { message: string }
                if (message === 'stopped') break
                patchTurn(turnId, (turn) => ({
                  ...terminalizeActiveTools(turn, message),
                  error: message,
                }))
                break
              }
              case 'html_update': {
                const update = data as HtmlUpdateEvent
                if (update.projectId === projectId) {
                  setHtml(expandProjectImageUrls(update.html))
                }
                break
              }
              case 'retry': {
                const retry = data as RetryEvent
                appendPart(turnId, {
                  ...retry,
                  id: `${turnId}-retry-${retry.attempt}`,
                  startedAt: Date.now(),
                  type: 'retry',
                })
                break
              }
              case 'screenshot_request': {
                void respondToScreenshotRequest(data as ScreenshotRequestEvent)
                break
              }
              case 'stats': {
                const stats = data as {
                  cost: number
                  costBreakdown?: {
                    image?: { cost: number; count: number }
                    llm: number
                    scrape: {
                      calls: number
                      cost: number
                      credits: number
                      firecrawlCost?: number
                      ocrCalls?: number
                      ocrCost?: number
                      ocrImages?: number
                    }
                    total: number
                    vision?: {
                      calls: number
                      cost: number
                      images: number
                    }
                  }
                  durationMs: number
                  finishReason: string
                  model: string
                  usage: {
                    cachedInputTokens?: number
                    inputTokens?: number
                    outputTokens?: number
                    reasoningTokens?: number
                    totalTokens?: number
                  }
                }
                appendPart(turnId, { ...stats, type: 'stats' })
                break
              }
              case 'text': {
                const { delta } = data as { delta: string }
                patchTurn(turnId, (turn) => {
                  const last = turn.parts[turn.parts.length - 1]
                  if (last?.type === 'text') {
                    const updated = [...turn.parts]
                    updated[updated.length - 1] = {
                      ...last,
                      text: last.text + delta,
                    }
                    return { ...turn, parts: updated }
                  }
                  return {
                    ...turn,
                    parts: [
                      ...turn.parts,
                      { id: `${turnId}-text`, text: delta, type: 'text' },
                    ],
                  }
                })
                break
              }
              case 'thinking': {
                const { delta } = data as { delta: string }
                patchTurn(turnId, (turn) => {
                  const last = turn.parts[turn.parts.length - 1]
                  if (last?.type === 'thinking') {
                    const updated = [...turn.parts]
                    updated[updated.length - 1] = {
                      ...last,
                      text: last.text + delta,
                    }
                    return { ...turn, parts: updated }
                  }
                  return {
                    ...turn,
                    parts: [
                      ...turn.parts,
                      { id: `${turnId}-think`, text: delta, type: 'thinking' },
                    ],
                  }
                })
                break
              }
              case 'tool_call': {
                const incoming = data as Omit<ToolCallPart, 'type'>
                const payload: ToolCallPart = { ...incoming, type: 'tool_call' }
                patchTurn(turnId, (turn) => {
                  const existing = turn.parts.findIndex(
                    (p) => p.type === 'tool_call' && p.id === payload.id,
                  )
                  if (existing !== -1) {
                    const updated = [...turn.parts]
                    const previous = updated[existing] as ToolCallPart
                    updated[existing] = {
                      ...previous,
                      ...payload,
                      detail: payload.detail ?? previous.detail,
                      intent: payload.intent ?? previous.intent,
                      result: payload.result ?? previous.result,
                    }
                    return { ...turn, parts: updated }
                  }
                  return { ...turn, parts: [...turn.parts, payload] }
                })
                // The edit tool writes the project file; the server streams
                // changed HTML separately through `html_update` for the preview.
                if (payload.tool === 'edit' && payload.state === 'done') {
                  patchTurn(turnId, (turn) => ({
                    ...turn,
                    htmlSwaps: turn.htmlSwaps + 1,
                  }))
                }
                break
              }
              default:
                break
            }
          },
          signal: controller.signal,
        },
      )
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error)
          if (message !== 'stopped' && !controller.signal.aborted) {
            patchTurn(turnId, (turn) => ({
              ...terminalizeActiveTools(turn, message),
              error: message,
            }))
          }
        })
        .finally(() => {
          patchTurn(turnId, (turn) => ({
            ...terminalizeActiveTools(turn),
            isStreaming: false,
          }))
          setIsStreaming(false)
          controllerRef.current = null
        })
    },
    [
      appendPart,
      isStreaming,
      model,
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
          ? { ...terminalizeActiveTools(turn, 'Stopped.'), isStreaming: false }
          : turn,
      ),
    )
  }, [])

  return {
    html,
    isStreaming,
    missing,
    model,
    send,
    setModel: persistModel,
    stop,
    turns,
  }
}

function restoreProjectTurns(turns: LandingTurn[]): LandingTurn[] {
  return turns.map((turn) => {
    const restored = terminalizeActiveTools({
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
}: ImageAttachmentInput): ImageAttachmentMeta {
  return metadata
}

function terminalizeActiveTools(
  turn: LandingTurn,
  result: string = 'Tool did not return a result before the response completed.',
): LandingTurn {
  let changed = false
  const parts = turn.parts.map((part) => {
    if (
      part.type !== 'tool_call' ||
      (part.state !== 'running' && part.state !== 'start')
    ) {
      return part
    }
    changed = true
    return {
      ...part,
      result: part.result ?? result,
      state: 'error' as const,
    }
  })
  return changed ? { ...turn, parts } : turn
}
