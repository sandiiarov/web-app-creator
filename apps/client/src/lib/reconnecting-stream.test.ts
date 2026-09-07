import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  subscribeWithRecovery,
  type ConnectionStatus,
} from './reconnecting-stream'
import { SSETransportError, type SSEEvent, streamSSEGet } from './sse-client'

vi.mock('./sse-client', () => ({
  SSETransportError: class extends Error {
    code: string
    options: { fatal: boolean; status?: number }
    constructor(
      code: string,
      message: string,
      options: { fatal: boolean; status?: number },
    ) {
      super(message)
      this.code = code
      this.options = options
    }
  },
  streamSSEGet: vi.fn<typeof streamSSEGet>(),
}))

afterEach(() => {
  vi.resetAllMocks()
  vi.useRealTimers()
})

describe('subscription recovery', () => {
  it('reconnects after EOF, resets delay after hydration, and stops on abort', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const statuses: ConnectionStatus[] = []
    vi.mocked(streamSSEGet).mockImplementation(async (_url, options) => {
      options.onEvent({ data: { version: 2 }, event: 'state' })
    })
    const promise = subscribeWithRecovery('/events', {
      onEvent: vi.fn<(event: SSEEvent) => void>(),
      onMissing: vi.fn<() => void>(),
      onStatus: (status) => statuses.push(status),
      random: () => 0.5,
      signal: controller.signal,
    })
    await vi.advanceTimersByTimeAsync(500)
    expect(streamSSEGet).toHaveBeenCalledTimes(2)
    expect(statuses).toContain('connected')
    controller.abort()
    await promise
  })

  it('uses bounded exponential retry delays until cancelled', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    vi.mocked(streamSSEGet).mockRejectedValue(new Error('Network unavailable'))
    const promise = subscribeWithRecovery('/events', {
      onEvent: vi.fn<(event: SSEEvent) => void>(),
      onMissing: vi.fn<() => void>(),
      onStatus: vi.fn<(status: ConnectionStatus, reason?: string) => void>(),
      random: () => 0.5,
      signal: controller.signal,
    })
    await vi.advanceTimersByTimeAsync(500 + 1000 + 2000 + 4000 + 8000 + 10000)
    expect(vi.mocked(streamSSEGet).mock.calls.length).toBeGreaterThanOrEqual(6)
    controller.abort()
    await promise
  })

  it('does not retry missing or forbidden projects', async () => {
    for (const status of [403, 404]) {
      vi.mocked(streamSSEGet).mockReset()
      vi.mocked(streamSSEGet).mockRejectedValue(
        new SSETransportError('HTTP', 'fatal', { fatal: true, status }),
      )
      const onMissing = vi.fn<() => void>()
      const onStatus = vi.fn<(status: ConnectionStatus) => void>()
      await subscribeWithRecovery('/events', {
        onEvent: vi.fn<(event: SSEEvent) => void>(),
        onMissing,
        onStatus,
        signal: new AbortController().signal,
      })
      expect(streamSSEGet).toHaveBeenCalledOnce()
      expect(onMissing).toHaveBeenCalledTimes(status === 404 ? 1 : 0)
      expect(onStatus).toHaveBeenLastCalledWith('unavailable', 'fatal')
    }
  })

  it('reconnects when the stream stays silent past the idle deadline', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    vi.mocked(streamSSEGet).mockImplementation(
      (_url, options) =>
        new Promise<void>((_resolve, reject) => {
          options.signal.addEventListener(
            'abort',
            () => reject(options.signal.reason),
            { once: true },
          )
        }),
    )
    const promise = subscribeWithRecovery('/events', {
      idleTimeoutMs: 45_000,
      onEvent: vi.fn<(event: SSEEvent) => void>(),
      onMissing: vi.fn<() => void>(),
      onStatus: vi.fn<(status: ConnectionStatus, reason?: string) => void>(),
      random: () => 0.5,
      signal: controller.signal,
    })
    await vi.advanceTimersByTimeAsync(45_500)
    expect(streamSSEGet).toHaveBeenCalledTimes(2)
    controller.abort()
    await promise
  })

  it('does not declare a snapshot connected when validation rejects it', async () => {
    const statuses: ConnectionStatus[] = []
    vi.mocked(streamSSEGet).mockImplementation(async (_url, options) => {
      options.onEvent({ data: { invalid: true }, event: 'state' })
    })
    await subscribeWithRecovery('/events', {
      onEvent() {
        throw new SSETransportError('INVALID_FRAME', 'invalid snapshot', {
          fatal: true,
        })
      },
      onMissing: vi.fn<() => void>(),
      onStatus: (status) => statuses.push(status),
      signal: new AbortController().signal,
    })
    expect(statuses).toEqual(['connecting', 'unavailable'])
  })

  it('clamps the jittered retry delay to ten seconds', async () => {
    const controller = new AbortController()
    const retryDelays: number[] = []
    vi.mocked(streamSSEGet).mockRejectedValue(new Error('offline'))
    let attempts = 0
    await subscribeWithRecovery('/events', {
      onEvent: vi.fn<(event: SSEEvent) => void>(),
      onMissing: vi.fn<() => void>(),
      onStatus: vi.fn<(status: ConnectionStatus, reason?: string) => void>(),
      random: () => 1,
      scheduler: {
        clearTimeout() {},
        setTimeout(callback, delayMs) {
          if (delayMs !== 45_000) {
            retryDelays.push(delayMs)
            attempts += 1
            if (attempts === 6) controller.abort()
            queueMicrotask(callback)
          }
          return Symbol('timer')
        },
      },
      signal: controller.signal,
    })
    expect(Math.max(...retryDelays)).toBe(10_000)
  })
})
