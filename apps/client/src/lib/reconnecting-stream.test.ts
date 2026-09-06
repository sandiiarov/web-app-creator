import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  subscribeWithRecovery,
  type ConnectionStatus,
} from './reconnecting-stream'
import { type SSEEvent, streamSSEGet } from './sse-client'
vi.mock('./sse-client', () => ({ streamSSEGet: vi.fn<typeof streamSSEGet>() }))
afterEach(() => {
  vi.resetAllMocks()
  vi.useRealTimers()
})

describe('subscription recovery', () => {
  it('reconnects after EOF, rehydrates, and stops retrying on abort', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const statuses: ConnectionStatus[] = []
    const onEvent = vi.fn<(event: SSEEvent) => void>()
    vi.mocked(streamSSEGet).mockImplementation(async (_url, options) => {
      options.onEvent({
        data: { html: `revision-${vi.mocked(streamSSEGet).mock.calls.length}` },
        event: 'state',
      })
    })
    const promise = subscribeWithRecovery('/events', {
      onEvent,
      onMissing: vi.fn<() => void>(),
      onStatus: (status) => statuses.push(status),
      signal: controller.signal,
    })
    await vi.advanceTimersByTimeAsync(1000)
    expect(streamSSEGet).toHaveBeenCalledTimes(2)
    expect(onEvent).toHaveBeenLastCalledWith({
      data: { html: 'revision-2' },
      event: 'state',
    })
    expect(statuses).toContain('reconnecting')
    controller.abort()
    await promise
    await vi.advanceTimersByTimeAsync(30_000)
    expect(streamSSEGet).toHaveBeenCalledTimes(2)
  })
  it('bounds repeated failures and exposes offline recovery', async () => {
    vi.useFakeTimers()
    vi.mocked(streamSSEGet).mockRejectedValue(new Error('Network unavailable'))
    const onStatus = vi.fn<(status: ConnectionStatus) => void>()
    const promise = subscribeWithRecovery('/events', {
      onEvent: vi.fn<(event: SSEEvent) => void>(),
      onMissing: vi.fn<() => void>(),
      onStatus,
      signal: new AbortController().signal,
    })
    await vi.runAllTimersAsync()
    await promise
    expect(streamSSEGet).toHaveBeenCalledTimes(5)
    expect(onStatus).toHaveBeenLastCalledWith('offline')
  })
  it('does not retry a deleted project', async () => {
    vi.mocked(streamSSEGet).mockRejectedValue(
      new Error('Request failed (404): not found'),
    )
    const onMissing = vi.fn<() => void>()
    await subscribeWithRecovery('/events', {
      onEvent: vi.fn<(event: SSEEvent) => void>(),
      onMissing,
      onStatus: vi.fn<(status: ConnectionStatus) => void>(),
      signal: new AbortController().signal,
    })
    expect(onMissing).toHaveBeenCalledOnce()
    expect(streamSSEGet).toHaveBeenCalledOnce()
  })
})
