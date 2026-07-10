import { describe, expect, it } from 'vitest'

import { applyEventToTurn, replayClientEvents } from './reducer.ts'
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
        action: 'Edit hero',
        id: 'call-1',
        state: 'running',
        tool: 'edit',
      }),
      out('tool_call', { id: 'call-1', result: 'ok', state: 'done' }),
    ])
    expect(turns[0]?.parts).toEqual([
      {
        action: 'Edit hero',
        id: 'call-1',
        result: 'ok',
        state: 'done',
        tool: 'edit',
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

  it('appends a stats part', () => {
    const turns = replayClientEvents([
      prompt('turn-1'),
      out('stats', {
        cost: 0.01,
        durationMs: 5,
        finishReason: 'stop',
        model: 'm',
        usage: { totalTokens: 10 },
      }),
    ])
    expect(turns[0]?.parts).toEqual([
      {
        cost: 0.01,
        durationMs: 5,
        finishReason: 'stop',
        model: 'm',
        type: 'stats',
        usage: { totalTokens: 10 },
      },
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
