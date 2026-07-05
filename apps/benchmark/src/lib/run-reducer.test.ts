import { describe, expect, it } from 'vitest'

import { applySseEvent } from './run-reducer'
import {
  createInitialRunResult,
  type RunResult,
  type RunResultMeta,
} from './types'

const meta: RunResultMeta = {
  id: 'run-1',
  modelId: 'z-ai/glm-5.2',
  modelLabel: 'GLM 5.2',
  projectId: '',
  promptId: 'p-1',
  promptText: 'Build a hero',
}

function baseline(): RunResult {
  return createInitialRunResult(meta)
}

describe('applySseEvent', () => {
  it('chains text deltas in arrival order when each event reads the prior output', () => {
    // This is the contract the run hook relies on: events for a single run are
    // folded sequentially, each one reading the accumulator the previous event
    // produced. The hook keeps a synchronous accumulator ref so bursts that
    // arrive between React renders still chain (an earlier version read from a
    // render-lagged snapshot and clobbered every delta but the last, scrambling
    // the recorded assistant text).
    let result = baseline()
    for (const delta of ['Hello', ', ', 'world', '!']) {
      result = applySseEvent(result, {
        data: { delta },
        event: 'text',
      }).result
    }
    expect(result.text).toBe('Hello, world!')
  })

  it('drops deltas when every event reads the same stale snapshot (documents the fixed bug)', () => {
    // Encoding the failure mode as a guard: if a caller feeds each event the
    // SAME base snapshot (the stale-ref pattern), only the final delta survives.
    const snapshot = baseline()
    let reported = snapshot
    for (const delta of ['Hello', ', ', 'world', '!']) {
      // BUG shape: always fold from `snapshot`, not from the prior `reported`.
      reported = applySseEvent(snapshot, {
        data: { delta },
        event: 'text',
      }).result
    }
    expect(reported.text).toBe('!')
    expect(reported.text).not.toBe('Hello, world!')
  })

  it('keeps the latest html_update payload', () => {
    let result = baseline()
    result = applySseEvent(result, {
      data: { html: '<p>v1</p>', projectId: 'p', sequence: 1 },
      event: 'html_update',
    }).result
    result = applySseEvent(result, {
      data: { html: '<p>v2</p>', projectId: 'p', sequence: 2 },
      event: 'html_update',
    }).result
    expect(result.html).toBe('<p>v2</p>')
  })

  it('merges tool-call chunks by id and records terminal tool errors as mistakes', () => {
    let result = baseline()
    result = applySseEvent(result, {
      data: {
        detail: 'Generate hero image',
        id: 'call-1',
        intent: 'hero imagery',
        state: 'running',
        tool: 'generate_image',
      },
      event: 'tool_call',
    }).result
    result = applySseEvent(result, {
      data: {
        id: 'call-1',
        result: 'OpenRouter image API error (404): no model',
        state: 'error',
        tool: 'generate_image',
      },
      event: 'tool_call',
    }).result
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0]).toMatchObject({
      id: 'call-1',
      state: 'error',
      tool: 'generate_image',
    })
    expect(result.mistakes).toMatchObject([
      { kind: 'tool_error', tool: 'generate_image' },
    ])
  })

  it('ignores unhandled event kinds without mutating the result', () => {
    const before = baseline()
    const after = applySseEvent(before, {
      data: { foo: 'bar' },
      event: 'nope',
    }).result
    expect(after).toEqual(before)
  })
})
