import { describe, expect, it } from 'vitest'

import {
  applyEventToTurn,
  replayClientEvents,
  replayClientEventsLive,
} from './reducer.ts'
import type { ClientEvent } from './types.ts'

const out = (
  event: string,
  payload: Record<string, unknown> = {},
  ts = 't',
): ClientEvent => ({ dir: 'out', event, payload, ts })

const prompt = (
  turnId: string,
  extra: Record<string, unknown> = {},
): ClientEvent => ({
  dir: 'in',
  model: 'm',
  prompt: 'hi',
  ts: 't0',
  turnId,
  type: 'prompt',
  ...extra,
})

describe('replayClientEvents (hydration fold)', () => {
  it('merges consecutive text deltas into one text part', () => {
    const turns = replayClientEvents([
      prompt('turn-1'),
      out('text', { delta: 'H' }),
      out('text', { delta: 'i' }),
    ])
    expect(turns).toHaveLength(1)
    expect(turns[0]?.parts).toEqual([
      { id: 'turn-1-text', text: 'Hi', type: 'text' },
    ])
  })

  it('merges thinking deltas separately from text', () => {
    const turns = replayClientEvents([
      prompt('turn-1'),
      out('thinking', { delta: 'hm' }),
      out('thinking', { delta: '?' }),
      out('text', { delta: 'ok' }),
    ])
    expect(turns[0]?.parts).toEqual([
      { id: 'turn-1-think', text: 'hm?', type: 'thinking' },
      { id: 'turn-1-text', text: 'ok', type: 'text' },
    ])
  })

  it('upserts a tool_call by id, preserving prior optional fields', () => {
    const turns = replayClientEvents([
      prompt('turn-1'),
      out('tool_call', {
        action: 'Review hero',
        id: 'call-1',
        images: [{ alt: 'Hero screenshot', url: '/screenshots/hero.png' }],
        state: 'running',
        tool: 'screenshot',
      }),
      out('tool_call', { id: 'call-1', result: 'ok', state: 'done' }),
    ])
    expect(turns[0]?.parts).toEqual([
      {
        action: 'Review hero',
        id: 'call-1',
        images: [{ alt: 'Hero screenshot', url: '/screenshots/hero.png' }],
        result: 'ok',
        state: 'done',
        tool: 'screenshot',
        type: 'tool_call',
      },
    ])
  })

  it('removes a tool_call part on tool_call_drop', () => {
    const turns = replayClientEvents([
      prompt('turn-1'),
      out('tool_call', { id: 'call-1', state: 'running', tool: 'edit' }),
      out('tool_call_drop', { id: 'call-1' }),
    ])
    expect(turns[0]?.parts).toEqual([])
  })

  it('increments htmlSwaps only for a done edit tool_call', () => {
    const turns = replayClientEvents([
      prompt('turn-1'),
      out('tool_call', { id: 'call-1', state: 'done', tool: 'edit' }),
      out('tool_call', { id: 'call-2', state: 'done', tool: 'read' }),
    ])
    expect(turns[0]?.htmlSwaps).toBe(1)
  })

  it('upserts rolling stats so a turn keeps only its latest snapshot', () => {
    const turns = replayClientEvents([
      prompt('turn-1'),
      out('stats', {
        cost: 0.01,
        durationMs: 5,
        finishReason: 'in-progress',
        model: 'm',
        usage: { totalTokens: 10 },
      }),
      out('text', { delta: 'Working' }),
      out('stats', {
        cost: 0.03,
        durationMs: 15,
        finishReason: 'stop',
        model: 'm',
        usage: { totalTokens: 30 },
      }),
    ])
    expect(turns[0]?.parts).toEqual([
      {
        cost: 0.03,
        durationMs: 15,
        finishReason: 'stop',
        model: 'm',
        type: 'stats',
        usage: { totalTokens: 30 },
      },
      { id: 'turn-1-text', text: 'Working', type: 'text' },
    ])
  })

  it('persists stopped separately from errors and keeps stats through done', () => {
    const stopped = replayClientEvents([
      prompt('turn-1'),
      out('tool_call', { id: 'c', state: 'running', tool: 'edit' }),
      out('stats', {
        cost: 0.01,
        durationMs: 5,
        finishReason: 'stopped',
        model: 'm',
        usage: { totalTokens: 10 },
      }),
      out('error', { message: 'stopped' }),
      out('done'),
    ])
    expect(stopped[0]).toMatchObject({
      isStreaming: false,
      stopped: true,
    })
    expect(stopped[0]?.error).toBeUndefined()
    expect(stopped[0]?.parts).toEqual([
      expect.objectContaining({
        id: 'c',
        result: 'Stopped.',
        state: 'error',
        type: 'tool_call',
      }),
      expect.objectContaining({
        finishReason: 'stopped',
        type: 'stats',
        usage: { totalTokens: 10 },
      }),
    ])

    const draining = replayClientEvents([
      prompt('turn-1'),
      out('error', { message: 'stopped' }),
    ])
    expect(draining[0]).toMatchObject({ isStreaming: true, stopped: true })

    const errored = replayClientEvents([
      prompt('turn-2'),
      out('tool_call', { id: 'c', state: 'running', tool: 'edit' }),
      out('error', { message: 'boom' }),
    ])
    expect(errored[0]?.error).toBe('boom')
    expect(errored[0]?.stopped).toBeUndefined()
    expect(errored[0]?.parts[0]).toMatchObject({
      id: 'c',
      result: 'boom',
      state: 'error',
    })
  })

  it('finalizes on done: isStreaming false and running tools terminalized', () => {
    const turns = replayClientEvents([
      prompt('turn-1'),
      out('tool_call', { id: 'c', state: 'running', tool: 'edit' }),
      out('done'),
    ])
    expect(turns[0]?.isStreaming).toBe(false)
    expect(turns[0]?.parts[0]).toMatchObject({ id: 'c', state: 'error' })
  })

  it('terminalizes running tools on restore even without a done event', () => {
    const turns = replayClientEvents([
      prompt('turn-1'),
      out('tool_call', { id: 'c', state: 'running', tool: 'edit' }),
    ])
    expect(turns[0]?.isStreaming).toBe(true)
    expect(turns[0]?.parts[0]).toMatchObject({ id: 'c', state: 'error' })
  })

  it('sets turn.attachments from attachments_update', () => {
    const turns = replayClientEvents([
      prompt('turn-1'),
      out('attachments_update', {
        attachments: [
          { id: 'a', mediaType: 'image/png', name: 'pic', size: 1 },
        ],
      }),
    ])
    expect(turns[0]?.attachments).toEqual([
      { id: 'a', mediaType: 'image/png', name: 'pic', size: 1 },
    ])
  })

  it('keys the turn id on the prompt-in turnId, falling back to turn-N', () => {
    expect(replayClientEvents([prompt('abc')])[0]?.id).toBe('abc')
    expect(
      replayClientEvents([
        { dir: 'in', prompt: 'hi', ts: 't0', type: 'prompt' },
      ])[0]?.id,
    ).toBe('turn-1')
  })

  it('replays multiple prompt-ins into separate turns', () => {
    const turns = replayClientEvents([
      prompt('turn-1'),
      out('text', { delta: 'a' }),
      prompt('turn-2'),
      out('text', { delta: 'b' }),
    ])
    expect(turns.map((t) => t.id)).toEqual(['turn-1', 'turn-2'])
    expect(turns[0]?.parts[0]).toMatchObject({ text: 'a' })
    expect(turns[1]?.parts[0]).toMatchObject({ text: 'b' })
  })

  // Known divergence: the live client reducer appends a 'retry' part on a
  // `retry` SSE event, but the shared hydration reducer intentionally skips
  // `retry` (no turn-structure effect), so retry parts do not survive a
  // reload. Pinned here so a future reconciler sees it.
  it('does not reconstruct retry events on reload (intentional)', () => {
    const turns = replayClientEvents([
      prompt('turn-1'),
      out('retry', { attempt: 1 }),
      out('text', { delta: 'x' }),
    ])
    expect(turns[0]?.parts).toEqual([
      { id: 'turn-1-text', text: 'x', type: 'text' },
    ])
  })
})

describe('replayClientEventsLive (subscribe catch-up)', () => {
  it('keeps a still-streaming turn live: isStreaming true, running tool NOT terminalized', () => {
    const events = [
      prompt('turn-1'),
      out('text', { delta: 'working' }),
      out('tool_call', { id: 'c', state: 'running', tool: 'edit' }),
    ]
    const live = replayClientEventsLive(events)
    expect(live).toHaveLength(1)
    expect(live[0]?.isStreaming).toBe(true)
    expect(live[0]?.parts[0]).toMatchObject({ text: 'working', type: 'text' })
    expect(live[0]?.parts[1]).toMatchObject({
      id: 'c',
      state: 'running',
      tool: 'edit',
      type: 'tool_call',
    })
    expect(live[0]?.parts[1]).not.toHaveProperty('result')
  })

  it('still honors an explicit done/error in the log (terminal events apply)', () => {
    const live = replayClientEventsLive([
      prompt('turn-1'),
      out('tool_call', { id: 'c', state: 'running', tool: 'edit' }),
      out('done'),
    ])
    expect(live[0]?.isStreaming).toBe(false)
    expect(live[0]?.parts[0]).toMatchObject({ id: 'c', state: 'error' })
  })

  it('diverges from replayClientEvents only on an unterminated final turn', () => {
    const events = [
      prompt('turn-1'),
      out('text', { delta: 'x' }),
      out('tool_call', { id: 'c', state: 'running', tool: 'edit' }),
    ]
    // Restore variant terminalizes the running tool to error.
    expect(replayClientEvents(events)[0]?.parts[1]).toMatchObject({
      id: 'c',
      result: expect.any(String),
      state: 'error',
    })
    // Live variant leaves it running.
    expect(replayClientEventsLive(events)[0]?.parts[1]).toMatchObject({
      id: 'c',
      state: 'running',
    })
  })

  it('produces identical output for a fully terminal log (done present)', () => {
    const events = [
      prompt('turn-1'),
      out('text', { delta: 'done' }),
      out('done'),
    ]
    expect(replayClientEventsLive(events)).toEqual(replayClientEvents(events))
  })
})

describe('applyEventToTurn (per-event, immutable)', () => {
  it('does not mutate the input turn', () => {
    const turn = {
      htmlSwaps: 0,
      id: 'turn-1',
      isStreaming: true,
      model: 'm',
      parts: [],
      prompt: 'hi',
    }
    const before = JSON.parse(JSON.stringify(turn))
    applyEventToTurn(turn, out('text', { delta: 'x' }))
    applyEventToTurn(
      turn,
      out('tool_call', { id: 'c', state: 'done', tool: 'edit' }),
    )
    expect(JSON.parse(JSON.stringify(turn))).toEqual(before)
  })
})
