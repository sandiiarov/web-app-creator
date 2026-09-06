import { streamSSEGet, type SSEEvent } from './sse-client'

export type ConnectionStatus =
  | 'connecting'
  | 'live'
  | 'offline'
  | 'reconnecting'

/** Every reconnect rehydrates from the server snapshot; requests are never replayed. */
export async function subscribeWithRecovery(
  url: string,
  options: {
    onEvent: (event: SSEEvent) => void
    onMissing: () => void
    onStatus: (status: ConnectionStatus) => void
    signal: AbortSignal
  },
) {
  const { onEvent, onMissing, onStatus, signal } = options
  for (let attempt = 0; !signal.aborted; attempt += 1) {
    onStatus(attempt === 0 ? 'connecting' : 'reconnecting')
    const started = Date.now()
    const attemptController = new AbortController()
    const abortAttempt = () => attemptController.abort()
    signal.addEventListener('abort', abortAttempt, { once: true })
    const connectTimer = setTimeout(abortAttempt, 15_000)
    try {
      await streamSSEGet(url, {
        onEvent(event) {
          if (signal.aborted) return
          if (event.event === 'state') {
            clearTimeout(connectTimer)
            onStatus('live')
          }
          onEvent(event)
        },
        signal: attemptController.signal,
      })
    } catch (error) {
      if (signal.aborted) return
      if (error instanceof Error && /\(404\)/.test(error.message)) {
        onMissing()
        return
      }
    } finally {
      clearTimeout(connectTimer)
      signal.removeEventListener('abort', abortAttempt)
    }
    if (signal.aborted) return
    if (Date.now() - started > 30_000) attempt = 0
    if (attempt >= 4) {
      onStatus('offline')
      return
    }
    onStatus('reconnecting')
    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer)
        signal.removeEventListener('abort', finish)
        resolve()
      }
      const timer = setTimeout(finish, Math.min(1000 * 2 ** attempt, 8000))
      signal.addEventListener('abort', finish, { once: true })
    })
  }
}
