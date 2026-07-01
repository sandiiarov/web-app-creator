import { useCallback, useEffect, useRef, useState } from 'react'

import {
  LANDING_AGENT_API,
  LANDING_MODEL_OPTIONS,
  type LandingTurn,
  type ToolCallPart,
  type TurnPart,
} from '../lib/landing-agent'
import {
  ProjectNotFoundError,
  expandProjectImageUrls,
  getProject,
} from '../lib/projects-api'
import { streamSSE } from '../lib/sse-client'

export interface UseLandingPage {
  html: string
  isStreaming: boolean
  missing: boolean
  model: string
  send: (prompt: string) => void
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
  const [model, setModel] = useState(LANDING_MODEL_OPTIONS[0]!.id)
  const [isStreaming, setIsStreaming] = useState(false)
  const [missing, setMissing] = useState(false)
  const controllerRef = useRef<AbortController | null>(null)

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
        if (project.model) setModel(project.model)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (err instanceof ProjectNotFoundError) setMissing(true)
        else onError(err instanceof Error ? err.message : 'Failed to load project')
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

  // Pull the latest HTML from the server after an `edit` completes. The agent
  // writes the project file directly; this is how the preview stays in sync.
  const refreshHtml = useCallback(async () => {
    try {
      const project = await getProject(projectId)
      setHtml(expandProjectImageUrls(project.indexHtml))
    } catch {
      // Swallow — the run's own error reporting handles hard failures.
    }
  }, [projectId])

  const send = useCallback(
    (prompt: string) => {
      if (isStreaming) return

      const turnId = nextTurnId()
      const turn: LandingTurn = {
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
        { model, projectId, prompt },
        {
          onEvent: ({ data, event }) => {
            switch (event) {
              case 'done': {
                patchTurn(turnId, (turn) => ({ ...turn, isStreaming: false }))
                break
              }
              case 'error': {
                const { message } = data as { message: string }
                if (message === 'stopped') break
                patchTurn(turnId, (turn) => ({ ...turn, error: message }))
                onError(message)
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
                // The edit tool writes the project file; pull the new HTML.
                if (payload.tool === 'edit' && payload.state === 'done') {
                  patchTurn(turnId, (turn) => ({
                    ...turn,
                    htmlSwaps: turn.htmlSwaps + 1,
                  }))
                  void refreshHtml()
                }
                break
              }
              default:
                break
            }
          },
          signal: controller.signal,
        },
      ).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        if (message !== 'stopped' && !controller.signal.aborted) {
          patchTurn(turnId, (turn) => ({ ...turn, error: message }))
          onError(message)
        }
      }).finally(() => {
        patchTurn(turnId, (turn) => ({ ...turn, isStreaming: false }))
        setIsStreaming(false)
        controllerRef.current = null
      })
    },
    [appendPart, isStreaming, model, onError, patchTurn, projectId, refreshHtml],
  )

  const stop = useCallback(() => {
    controllerRef.current?.abort()
    setIsStreaming(false)
    setTurns((prev) =>
      prev.map((turn) => (turn.isStreaming ? { ...turn, isStreaming: false } : turn)),
    )
  }, [])

  return {
    html,
    isStreaming,
    missing,
    model,
    send,
    setModel,
    stop,
    turns,
  }
}
