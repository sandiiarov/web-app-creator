import { describe, expect, it } from 'vitest'

import { createProjectSession, reduceProjectSession } from './project-session'

const snapshot = {
  cursor: 1,
  documentHash: 'h1',
  html: '<html>one</html>',
  models: { image: 'image', text: 'text', vision: 'vision' },
  projectId: 'project-1',
  run: { blocked: false, startedAt: null, status: 'idle', turnId: null },
  title: 'One',
  turns: [],
  version: 2,
} as const

function event(
  seq: number,
  type: string,
  payload: unknown,
  turnId: null | string = 'turn-1',
) {
  return {
    payload,
    projectId: 'project-1',
    seq,
    ts: '2026-09-06T00:00:00.000Z',
    turnId,
    type,
    version: 2,
  }
}

describe('project session', () => {
  it('hydrates authoritatively while retaining an unrepresented optimistic request', () => {
    let state = createProjectSession('project-1')
    state = reduceProjectSession(state, {
      input: {
        projectId: 'project-1',
        prompt: 'Build',
        textModel: 'text',
        turnId: 'turn-1',
      },
      turn: {
        htmlSwaps: 0,
        id: 'turn-1',
        isStreaming: true,
        model: 'text',
        parts: [],
        prompt: 'Build',
        startedAt: 1,
      },
      type: 'submitted',
    })
    state = reduceProjectSession(state, { snapshot, type: 'snapshot' })
    expect(state.turns.map((turn) => turn.id)).toEqual(['turn-1'])
    expect(state.connection).toBe('connected')
  })

  it('merges committed acceptance with its optimistic turn and routes by envelope turn id', () => {
    let state = reduceProjectSession(createProjectSession('project-1'), {
      snapshot,
      type: 'snapshot',
    })
    state = reduceProjectSession(state, {
      event: event(2, 'run_accepted', {
        attachments: [],
        compactionPercent: null,
        imageModel: 'image',
        model: 'text',
        prompt: 'Build',
        requestDigest: 'digest',
        requestVersion: 1,
        visionModel: 'vision',
      }),
      type: 'event',
    })
    state = reduceProjectSession(state, {
      event: event(3, 'text', { delta: 'Hello' }),
      type: 'event',
    })
    expect(state.turns).toHaveLength(1)
    expect(state.turns[0]).toMatchObject({
      id: 'turn-1',
      parts: [{ text: 'Hello' }],
    })
  })

  it('requests a fresh snapshot for a gap or a document event without matching HTML', () => {
    let state = reduceProjectSession(createProjectSession('project-1'), {
      snapshot,
      type: 'snapshot',
    })
    state = reduceProjectSession(state, {
      event: event(3, 'checkpoint', {}, null),
      type: 'event',
    })
    expect(state).toMatchObject({
      connection: 'reconnecting',
      cursor: 1,
      needsSnapshot: true,
    })
    state = reduceProjectSession(createProjectSession('project-1'), {
      snapshot,
      type: 'snapshot',
    })
    state = reduceProjectSession(state, {
      event: event(2, 'document_changed', { bytes: 4, hash: 'h2' }),
      type: 'event',
    })
    expect(state).toMatchObject({
      cursor: 2,
      documentHash: 'h2',
      needsSnapshot: true,
    })
  })

  it('lets canonical terminal evidence outrank a delayed rejected acknowledgment', () => {
    let state = reduceProjectSession(createProjectSession('project-1'), {
      snapshot,
      type: 'snapshot',
    })
    state = submit(state)
    state = reduceProjectSession(state, {
      event: event(2, 'run_accepted', {
        attachments: [],
        compactionPercent: null,
        imageModel: 'image',
        model: 'text',
        prompt: 'Build',
        requestDigest: 'digest',
        requestVersion: 1,
        visionModel: 'vision',
      }),
      type: 'event',
    })
    state = reduceProjectSession(state, {
      event: event(3, 'run_terminal', {
        finishedAt: '2026-09-06T00:00:01.000Z',
        outcome: 'completed',
        stats: null,
        turnId: 'turn-1',
      }),
      type: 'event',
    })
    state = reduceProjectSession(state, {
      result: { outcome: 'rejected', reason: 'late', turnId: 'turn-1' },
      type: 'submission_result',
    })
    expect(state.turns[0]).toMatchObject({ isStreaming: false })
    expect(state.turns[0]).not.toHaveProperty('error')
    expect(state.pending).toEqual({})
    expect(state.activeInputs).toEqual({})
  })

  it('records HTTP acceptance and clears only the completed active input', () => {
    let state = submit(
      reduceProjectSession(createProjectSession('project-1'), {
        snapshot,
        type: 'snapshot',
      }),
    )
    state = reduceProjectSession(state, {
      result: { outcome: 'accepted', turnId: 'turn-1' },
      type: 'submission_result',
    })
    expect(state.accepted).toEqual({ 'turn-1': true })
    expect(state.pending).toEqual({})
    expect(state.activeInputs['turn-1']?.prompt).toBe('Build')
    state = reduceProjectSession(state, {
      event: event(2, 'run_terminal', {
        finishedAt: '2026-09-06T00:00:01.000Z',
        outcome: 'completed',
        stats: null,
        turnId: 'turn-1',
      }),
      type: 'event',
    })
    expect(state.activeInputs).toEqual({})
  })

  it('makes a rejected optimistic submission idle without disturbing newer evidence', () => {
    let state = submit(
      reduceProjectSession(createProjectSession('project-1'), {
        snapshot,
        type: 'snapshot',
      }),
    )
    state = reduceProjectSession(state, {
      result: {
        outcome: 'rejected',
        reason: 'conflict',
        turnId: 'turn-1',
      },
      type: 'submission_result',
    })
    expect(state.run).toMatchObject({ status: 'idle', turnId: null })
    expect(state.turns[0]).toMatchObject({
      error: 'conflict',
      isStreaming: false,
    })
  })

  it('applies run-independent metadata without inventing an active turn', () => {
    let state = reduceProjectSession(createProjectSession('project-1'), {
      snapshot,
      type: 'snapshot',
    })
    state = reduceProjectSession(state, {
      event: event(2, 'project_meta', { title: 'Remote' }, null),
      type: 'event',
    })
    expect(state).toMatchObject({ run: { turnId: null }, title: 'Remote' })
  })
})

function submit(state: ReturnType<typeof createProjectSession>) {
  return reduceProjectSession(state, {
    input: {
      attachments: [],
      projectId: 'project-1',
      prompt: 'Build',
      textModel: 'text',
      turnId: 'turn-1',
    },
    turn: {
      htmlSwaps: 0,
      id: 'turn-1',
      isStreaming: true,
      model: 'text',
      parts: [],
      prompt: 'Build',
      startedAt: 1,
    },
    type: 'submitted',
  })
}
