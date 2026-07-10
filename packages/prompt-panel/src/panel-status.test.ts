import { describe, expect, it } from 'vitest'

import type { LandingTurn } from './domain'
import { panelStatus } from './panel-status'

const turn = (overrides: Partial<LandingTurn> = {}): LandingTurn => ({
  htmlSwaps: 0,
  id: 'turn-1',
  isStreaming: false,
  model: 'model',
  parts: [],
  prompt: 'Build it',
  ...overrides,
})

describe('panelStatus', () => {
  it('is ready without populated turns', () => {
    expect(panelStatus({ isStreaming: false, turns: [] })).toBe('ready')
  })

  it('keeps generating precedence while a stopped run drains', () => {
    expect(
      panelStatus({ isStreaming: true, turns: [turn({ stopped: true })] }),
    ).toBe('generating')
  })

  it('keeps a real error ahead of stopped state', () => {
    expect(
      panelStatus({
        isStreaming: false,
        turns: [turn({ error: 'boom', stopped: true })],
      }),
    ).toBe('error')
  })

  it('reports a stopped terminal turn even when it contains stats', () => {
    expect(
      panelStatus({
        isStreaming: false,
        turns: [
          turn({
            parts: [
              {
                cost: 0.01,
                durationMs: 500,
                finishReason: 'stopped',
                model: 'model',
                type: 'stats',
                usage: { totalTokens: 10 },
              },
            ],
            stopped: true,
          }),
        ],
      }),
    ).toBe('stopped')
  })

  it('reports a populated successful turn as done', () => {
    expect(
      panelStatus({
        isStreaming: false,
        turns: [
          turn({ parts: [{ id: 'text-1', text: 'Done', type: 'text' }] }),
        ],
      }),
    ).toBe('done')
  })
})
