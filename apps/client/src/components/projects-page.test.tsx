// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'

import type { RunStatus } from '../lib/projects-api'
import { runStatusToPanelStatus } from '../lib/run-status'

describe('runStatusToPanelStatus', () => {
  it('maps every RunStatus to the matching prompt-panel PanelStatus', () => {
    const cases: Array<[RunStatus, ReturnType<typeof runStatusToPanelStatus>]> =
      [
        ['idle', 'ready'],
        ['running', 'generating'],
        ['error', 'error'],
        ['interrupted', 'error'],
        ['stopped', 'stopped'],
      ]
    for (const [runStatus, panelStatus] of cases) {
      expect(runStatusToPanelStatus(runStatus)).toBe(panelStatus)
    }
  })

  it('collapses interrupted (process restart mid-run) to error', () => {
    // The panel has no "interrupted" pill — a crashed run shows as Error.
    expect(runStatusToPanelStatus('interrupted')).toBe('error')
    expect(runStatusToPanelStatus('error')).toBe('error')
  })

  it('never returns null — every card gets a pill (idle shows Ready)', () => {
    // The list mirrors the panel header, which always shows a status pill.
    expect(runStatusToPanelStatus('idle')).toBe('ready')
  })
})
