import { describe, expect, it } from 'vitest'

import { StartRunCommandSchema, StartRunResultSchema } from './commands.ts'
import { ProjectEventSchema, ProtocolErrorSchema } from './project-events.ts'
import { ProjectListSnapshotSchema } from './project-list.ts'
import {
  ConversationTurnSchema,
  ProjectSnapshotSchema,
} from './project-snapshot.ts'

const turn = {
  attachments: [
    { id: 'attachment', kind: 'element', name: 'Hero', selector: '#hero' },
  ],
  htmlSwaps: 1,
  id: 'turn-1',
  isStreaming: true,
  model: 'model/test',
  parts: [
    { id: 'text-1', text: 'Hello', type: 'text' },
    {
      action: 'Inspect',
      id: 'tool-1',
      state: 'done',
      tool: 'read',
      type: 'tool_call',
    },
    {
      id: 'memory-1',
      operation: 'observation',
      state: 'done',
      type: 'memory',
    },
    {
      cost: 0.1,
      durationMs: 10,
      finishReason: 'stop',
      model: 'model/test',
      type: 'stats',
      usage: { inputTokens: 1 },
    },
  ],
  prompt: 'Build',
}

describe('shared contracts', () => {
  it('validates current command and acknowledgment variants', () => {
    expect(
      StartRunCommandSchema.parse({
        attachments: [{ kind: 'element', selector: '#hero' }],
        compactionPercent: 80,
        projectId: 'project-1',
        prompt: 'Build',
        turnId: 'turn-1',
      }),
    ).toMatchObject({ turnId: 'turn-1' })
    expect(
      StartRunResultSchema.parse({
        existing: true,
        ok: true,
        outcome: 'completed',
        status: 'running',
        turnId: 'turn-1',
      }),
    ).toMatchObject({ existing: true })
    expect(
      StartRunResultSchema.parse({
        error: 'Conflict',
        ok: false,
        reason: 'conflict',
      }),
    ).toMatchObject({ reason: 'conflict' })
  })

  it('rejects malformed command boundaries', () => {
    expect(() =>
      StartRunCommandSchema.parse({ projectId: '', prompt: 'Build' }),
    ).toThrow(/./)
    expect(() =>
      StartRunCommandSchema.parse({
        compactionPercent: Number.NaN,
        projectId: 'project',
        prompt: 'Build',
      }),
    ).toThrow(/./)
    expect(() =>
      StartRunCommandSchema.parse({
        projectId: 'project',
        prompt: 'Build',
        turnId: 'x'.repeat(129),
      }),
    ).toThrow(/./)
  })

  it('validates conversation turns without unchecked casts', () => {
    expect(ConversationTurnSchema.parse(turn)).toMatchObject({ id: 'turn-1' })
    expect(() =>
      ConversationTurnSchema.parse({ ...turn, htmlSwaps: -1 }),
    ).toThrow(/./)
    expect(() =>
      ConversationTurnSchema.parse({
        ...turn,
        parts: [{ state: 'maybe', type: 'memory' }],
      }),
    ).toThrow(/./)
    expect(() =>
      ConversationTurnSchema.parse({
        ...turn,
        parts: [
          {
            cost: 1,
            costBreakdown: {
              llm: 0,
              scrape: { calls: 'bad', cost: 1, credits: 1 },
              total: 1,
            },
            durationMs: 1,
            finishReason: 'stop',
            model: 'model',
            type: 'stats',
            usage: {},
          },
        ],
      }),
    ).toThrow(/./)
    expect(() =>
      ConversationTurnSchema.parse({
        ...turn,
        parts: [
          {
            cost: 1,
            costBreakdown: {},
            durationMs: 1,
            finishReason: 'stop',
            model: 'model',
            type: 'stats',
            usage: {},
          },
        ],
      }),
    ).toThrow(/./)
  })

  it('requires complete project snapshot identity and cursor', () => {
    const snapshot = {
      cursor: 7,
      documentHash: 'hash',
      html: '<!doctype html>',
      models: { image: 'image', text: 'text', vision: 'vision' },
      projectId: 'project-1',
      run: {
        blocked: false,
        startedAt: null,
        status: 'idle',
        turnId: null,
      },
      title: 'Project',
      titleSource: 'user',
      turns: [turn],
      version: 2,
    }
    expect(ProjectSnapshotSchema.parse(snapshot)).toMatchObject({ cursor: 7 })
    expect(() =>
      ProjectSnapshotSchema.parse({ ...snapshot, cursor: -1 }),
    ).toThrow(/./)
    const { projectId: _projectId, ...missingIdentity } = snapshot
    expect(() => ProjectSnapshotSchema.parse(missingIdentity)).toThrow(/./)
  })

  it('validates event identity, discriminated payloads, and list snapshots', () => {
    expect(
      ProjectEventSchema.parse({
        payload: { delta: 'Hi' },
        projectId: 'project-1',
        seq: 8,
        ts: '2026-09-06T00:00:00.000Z',
        turnId: 'turn-1',
        type: 'text',
        version: 2,
      }),
    ).toMatchObject({ seq: 8 })
    expect(() =>
      ProjectEventSchema.parse({
        payload: { delta: 'Hi' },
        projectId: 'project-1',
        seq: 8,
        ts: 'now',
        turnId: null,
        type: 'text',
        version: 2,
      }),
    ).toThrow(/./)
    expect(() =>
      ProjectEventSchema.parse({
        payload: { delta: 'Hi' },
        projectId: 'project-1',
        seq: 8,
        ts: 'now',
        turnId: '',
        type: 'text',
        version: 2,
      }),
    ).toThrow(/./)
    expect(() =>
      ProjectEventSchema.parse({
        payload: {
          cost: 'bad',
          durationMs: 1,
          finishReason: 'stop',
          model: 'model',
          usage: { inputTokens: 'bad' },
        },
        projectId: 'project-1',
        seq: 9,
        ts: 'now',
        turnId: 'turn-1',
        type: 'stats',
        version: 2,
      }),
    ).toThrow(/./)
    expect(() =>
      ProjectEventSchema.parse({
        payload: {
          finishedAt: 'now',
          outcome: 'completed',
          stats: null,
          turnId: 'turn-2',
        },
        projectId: 'project-1',
        seq: 10,
        ts: 'now',
        turnId: 'turn-1',
        type: 'run_terminal',
        version: 2,
      }),
    ).toThrow(/./)
    expect(
      ProjectListSnapshotSchema.parse({ projects: [], version: 2 }),
    ).toEqual({ projects: [], version: 2 })
    expect(
      ProtocolErrorSchema.parse({
        code: 'SNAPSHOT_TOO_LARGE',
        message: 'Snapshot is too large.',
        version: 2,
      }),
    ).toMatchObject({ code: 'SNAPSHOT_TOO_LARGE' })
  })
})
