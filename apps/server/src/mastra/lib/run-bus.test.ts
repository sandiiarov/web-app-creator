import type { ServerResponse } from 'node:http'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createRunBus, type RunBus } from './run-bus.ts'

const projectId = 'proj-bus'
let bus: RunBus

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
    bus = createRunBus()
  })

  it('claimRun rejects overlap and accepts the next claim after release', () => {
    const first = makeEntry('turn-1')
    expect(bus.claimRun(projectId, first)).toBe(true)
    expect(bus.claimRun(projectId, makeEntry('turn-2'))).toBe(false)
    bus.releaseRun(projectId, first)
    expect(bus.claimRun(projectId, makeEntry('turn-3'))).toBe(true)
  })

  it('releaseRun only deletes when ownership matches', () => {
    const first = makeEntry()
    bus.claimRun(projectId, first)
    // A stale reference (e.g. a second run that somehow got the same id) must
    // not free the slot owned by `first`.
    bus.releaseRun(projectId, makeEntry() as never)
    expect(bus.getRun(projectId)).toBe(first)
    bus.releaseRun(projectId, first)
    expect(bus.getRun(projectId)).toBeUndefined()
  })

  it('subscribeProject persists across the run lifecycle (idle → run starts → events arrive)', () => {
    // The bug this pins: a tab that subscribes while the project is IDLE must
    // still receive events when a run starts later (e.g. the user sends a
    // prompt from that same tab). The old transient `subscribe` was a no-op
    // when no run was active → the editor never saw the run it started.
    const response = fakeResponse()
    const unsubscribe = bus.subscribeProject(projectId, response)

    // No active run yet — broadcast must STILL reach the persistent subscriber.
    bus.broadcast(projectId, 'text', { delta: 'before-run' })
    expect(response.write).toHaveBeenCalledTimes(1)
    expect(response.write).toHaveBeenCalledWith(
      'event: text\ndata: {"delta":"before-run"}\n\n',
    )

    // A run starts + broadcasts — same subscriber still receives.
    const entry = makeEntry()
    bus.claimRun(projectId, entry)
    bus.broadcast(projectId, 'tool_call', { id: 'c', state: 'running' })
    expect(response.write).toHaveBeenCalledTimes(2)

    // Run ends — subscriber stays registered (next run reaches it too).
    bus.releaseRun(projectId, entry)
    bus.broadcast(projectId, 'done', {})
    expect(response.write).toHaveBeenCalledTimes(3)

    unsubscribe()
    bus.broadcast(projectId, 'text', { delta: 'after-unsubscribe' })
    expect(response.write).toHaveBeenCalledTimes(3)
  })

  it('subscribeProject supports multiple subscribers on the same idle project', () => {
    const first = fakeResponse()
    const second = fakeResponse()
    const unsubFirst = bus.subscribeProject(projectId, first)
    bus.subscribeProject(projectId, second)

    bus.broadcast(projectId, 'text', { delta: 'hi' })
    expect(first.write).toHaveBeenCalledTimes(1)
    expect(second.write).toHaveBeenCalledTimes(1)

    unsubFirst()
    bus.broadcast(projectId, 'text', { delta: 'again' })
    expect(first.write).toHaveBeenCalledTimes(1)
    expect(second.write).toHaveBeenCalledTimes(2)
  })

  it('broadcast fans every event out to ALL subscribers (multi-subscriber proof)', () => {
    const entry = makeEntry()
    bus.claimRun(projectId, entry)

    const sender = fakeResponse()
    const reopened = fakeResponse()
    const unsubscribeSender = bus.subscribeProject(projectId, sender)
    const unsubscribeReopened = bus.subscribeProject(projectId, reopened)

    bus.broadcast(projectId, 'text', { delta: 'hi' })
    bus.broadcast(projectId, 'done', {})

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
    bus.broadcast(projectId, 'stats', { cost: 0.01 })
    expect(sender.write).toHaveBeenCalledTimes(2)
    expect(reopened.write).toHaveBeenCalledTimes(3)

    unsubscribeReopened()
  })

  it('broadcast reaches both the run entry subscribers + persistent project subscribers', () => {
    // The run entry's own subscriber (startLandingAgent `subscriber` param) AND
    // a persistent project subscriber (events endpoint) both get the event.
    const entrySubscriber = fakeResponse()
    const entry = makeEntry()
    entry.subscribers.add(entrySubscriber)
    bus.claimRun(projectId, entry)

    const persistent = fakeResponse()
    bus.subscribeProject(projectId, persistent)

    bus.broadcast(projectId, 'text', { delta: 'both' })
    expect(entrySubscriber.write).toHaveBeenCalledTimes(1)
    expect(persistent.write).toHaveBeenCalledTimes(1)
  })
})
