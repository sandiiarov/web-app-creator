import { useCallback, useRef, useState } from 'react'

import {
  LANDING_AGENT_API,
  LANDING_MODEL_OPTIONS,
  type LandingTurn,
  type ToolCallPart,
  type TurnPart,
} from '../lib/landing-agent'
import { streamSSE } from '../lib/sse-client'

export interface UseLandingPage {
  html: string
  isStreaming: boolean
  model: string
  send: (prompt: string) => void
  setHtml: (html: string) => void
  setModel: (model: string) => void
  stop: () => void
  turns: LandingTurn[]
}

export interface UseLandingPageOptions {
  initialHtml?: string
  initialModel?: string
  onError: (message: string) => void
  onHtml?: (html: string) => void
}

let turnSeq = 0
const nextTurnId = () => `turn-${Date.now()}-${turnSeq++}`

export function useLandingPage({
  initialHtml = '',
  initialModel,
  onError,
  onHtml,
}: UseLandingPageOptions): UseLandingPage {
  const [turns, setTurns] = useState<LandingTurn[]>([])
  const [html, setHtml] = useState(initialHtml)
  const [model, setModel] = useState(initialModel ?? LANDING_MODEL_OPTIONS[0]!.id)
  const [isStreaming, setIsStreaming] = useState(false)
  const controllerRef = useRef<AbortController | null>(null)

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
        { model, prompt },
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
              case 'html': {
                const { html: nextHtml } = data as { html: string }
                setHtml(nextHtml)
                onHtml?.(nextHtml)
                patchTurn(turnId, (turn) => ({
                  ...turn,
                  htmlSwaps: turn.htmlSwaps + 1,
                }))
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
    [appendPart, isStreaming, model, onError, onHtml, patchTurn],
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
    model,
    send,
    setHtml,
    setModel,
    stop,
    turns,
  }
}
