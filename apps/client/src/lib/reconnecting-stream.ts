import { PROTOCOL_IDLE_TIMEOUT_MS } from '@workspace/contracts'

import { SSETransportError, streamSSEGet, type SSEEvent } from './sse-client'

export type ConnectionStatus =
  | 'connected'
  | 'connecting'
  | 'reconnecting'
  | 'unavailable'

export interface ReconnectScheduler {
  clearTimeout(handle: unknown): void
  setTimeout(callback: () => void, delayMs: number): unknown
}

const browserScheduler: ReconnectScheduler = {
  clearTimeout(handle) {
    clearTimeout(handle as ReturnType<typeof setTimeout>)
  },
  setTimeout(callback, delayMs) {
    return setTimeout(callback, delayMs)
  },
}

export async function subscribeWithRecovery(
  url: string,
  options: {
    fetch?: typeof globalThis.fetch
    idleTimeoutMs?: number
    onEvent: (event: SSEEvent) => void
    onMissing: () => void
    onStatus: (status: ConnectionStatus, reason?: string) => void
    random?: () => number
    scheduler?: ReconnectScheduler
    signal: AbortSignal
  },
) {
  const {
    fetch: fetchImpl,
    idleTimeoutMs = PROTOCOL_IDLE_TIMEOUT_MS,
    onEvent,
    onMissing,
    onStatus,
    random = Math.random,
    scheduler = browserScheduler,
    signal,
  } = options
  let attempt = 0
  while (!signal.aborted) {
    onStatus(attempt === 0 ? 'connecting' : 'reconnecting')
    const attemptController = new AbortController()
    const abortAttempt = () => attemptController.abort(signal.reason)
    signal.addEventListener('abort', abortAttempt, { once: true })
    let hydrated = false
    let failureReason: string | undefined
    let idleTimer: unknown
    const resetIdle = () => {
      if (idleTimer !== undefined) scheduler.clearTimeout(idleTimer)
      idleTimer = scheduler.setTimeout(
        () => attemptController.abort(new Error('SSE connection was idle.')),
        idleTimeoutMs,
      )
    }
    resetIdle()
    let fatal = false
    try {
      await streamSSEGet(url, {
        fetch: fetchImpl,
        onBytes: resetIdle,
        onEvent(event) {
          if (signal.aborted) return
          onEvent(event)
          if (event.event === 'state' || event.event === 'list_state') {
            hydrated = true
            attempt = 0
            onStatus('connected')
          }
          if (event.event === 'protocol_error') {
            fatal = true
            attemptController.abort(new Error('Fatal protocol error.'))
          }
        },
        signal: attemptController.signal,
      })
    } catch (error) {
      if (signal.aborted) return
      if (error instanceof SSETransportError && error.options.status === 404) {
        onMissing()
        onStatus('unavailable', error.message)
        return
      }
      fatal ||= error instanceof SSETransportError && error.options.fatal
      failureReason = error instanceof Error ? error.message : String(error)
    } finally {
      if (idleTimer !== undefined) scheduler.clearTimeout(idleTimer)
      signal.removeEventListener('abort', abortAttempt)
    }
    if (signal.aborted) return
    if (fatal) {
      onStatus('unavailable', failureReason)
      return
    }
    if (hydrated) attempt = 0
    onStatus('reconnecting')
    const baseDelay = Math.min(500 * 2 ** attempt, 10_000)
    attempt += 1
    const jitteredDelay = Math.round(baseDelay * (0.8 + random() * 0.4))
    await waitForRetry(Math.min(10_000, jitteredDelay), signal, scheduler)
  }
}

function waitForRetry(
  delayMs: number,
  signal: AbortSignal,
  scheduler: ReconnectScheduler,
) {
  return new Promise<void>((resolve) => {
    const finish = () => {
      scheduler.clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    const timer = scheduler.setTimeout(finish, delayMs)
    signal.addEventListener('abort', finish, { once: true })
  })
}
