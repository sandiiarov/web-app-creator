import type { ServerResponse } from 'node:http'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  broadcast,
  claimRun,
  getRun,
  releaseRun,
  subscribe,
} from './run-bus.ts'

const projectId = 'proj-bus'

function fakeResponse(): ServerResponse {
  return {
    destroyed: false,
    writableEnded: false,
    write: vi.fn<(chunk: string) => boolean>().mockReturnValue(true),
  } as unknown as ServerResponse
}

function makeEntry(turnId = 'turn-1') {
  return {
    controller: new AbortController(),
    startedAt: '2026-07-20T00:00:00.000Z',
    subscribers: new Set<ServerResponse>(),
    turnId,
  }
}

describe('run-bus', () => {
  beforeEach(() => {
    // releaseRun only deletes when ownership matches; claim a fresh entry and
    // drop it to reset the singleton map between tests.
    const existing = getRun(projectId)
    if (existing) releaseRun(projectId, existing)
  })

  it('claimRun rejects overlap and accepts the next claim after release', () => {
    const first = makeEntry('turn-1')
    expect(claimRun(projectId, first)).toBe(true)
    expect(claimRun(projectId, makeEntry('turn-2'))).toBe(false)
    releaseRun(projectId, first)
    expect(claimRun(projectId, makeEntry('turn-3'))).toBe(true)
  })

  it('releaseRun only deletes when ownership matches', () => {
    const first = makeEntry()
    claimRun(projectId, first)
    // A stale reference (e.g. a second run that somehow got the same id) must
    // not free the slot owned by `first`.
    releaseRun(projectId, makeEntry() as never)
    expect(getRun(projectId)).toBe(first)
    releaseRun(projectId, first)
    expect(getRun(projectId)).toBeUndefined()
  })

  it('subscribe is a no-op when no run exists', () => {
    const unsubscribe = subscribe(projectId, fakeResponse())
    expect(typeof unsubscribe).toBe('function')
    // Broadcasting with no run must not throw.
    expect(() => broadcast(projectId, 'text', { delta: 'x' })).not.toThrow()
  })

  it('broadcast fans every event out to ALL subscribers (multi-subscriber proof)', () => {
    const entry = makeEntry()
    claimRun(projectId, entry)

    const sender = fakeResponse()
    const reopened = fakeResponse()
    const unsubscribeSender = subscribe(projectId, sender)
    const unsubscribeReopened = subscribe(projectId, reopened)

    broadcast(projectId, 'text', { delta: 'hi' })
    broadcast(projectId, 'done', {})

    expect(sender.write).toHaveBeenCalledTimes(2)
    expect(reopened.write).toHaveBeenCalledTimes(2)
    expect(sender.write).toHaveBeenNthCalledWith(
      1,
      'event: text\ndata: {"delta":"hi"}\n\n',
    )
    expect(reopened.write).toHaveBeenNthCalledWith(
      2,
      'event: done\ndata: {}\n\n',
    )

    // Unsubscribing one subscriber stops its delivery but leaves the other.
    unsubscribeSender()
    broadcast(projectId, 'stats', { cost: 0.01 })
    expect(sender.write).toHaveBeenCalledTimes(2)
    expect(reopened.write).toHaveBeenCalledTimes(3)

    unsubscribeReopened()
  })

  it('broadcast skips a run whose subscribers set is empty', () => {
    const entry = makeEntry()
    claimRun(projectId, entry)
    expect(() => broadcast(projectId, 'text', { delta: 'x' })).not.toThrow()
  })
})
