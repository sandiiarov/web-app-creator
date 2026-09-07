import { appendFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createImageStore } from '../mastra/lib/image-store.ts'
import { createProjectFileSystem } from '../mastra/lib/project-filesystem.ts'
import { createProjectRepository } from '../mastra/lib/project-store.ts'
import { createRunBus } from '../mastra/lib/run-bus.ts'
import {
  createRuntimeFixture,
  type RuntimeFixture,
} from '../testing/runtime-fixture.ts'
import {
  createRunCoordinator,
  type RunCoordinator,
  type RunExecutor,
  type RunExecutionResult,
} from './run-coordinator.ts'

const fixtures: RuntimeFixture[] = []
const repositories: { dispose(): Promise<void> }[] = []
const coordinators: RunCoordinator[] = []

afterEach(async () => {
  const results = await Promise.allSettled([
    ...coordinators.splice(0).map((coordinator) => coordinator.dispose()),
    ...repositories.splice(0).map((repository) => repository.dispose()),
    ...fixtures.splice(0).map((fixture) => fixture.dispose()),
  ])
  vi.restoreAllMocks()
  const failures = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : [],
  )
  if (failures.length > 0) throw new AggregateError(failures)
})

describe('run coordinator', () => {
  it('commits one acceptance and terminal for concurrent same-turn retries', async () => {
    const fixture = await runtimeFixture()
    const project = await fixture.runtime.repository.createProject()
    const finish = deferred<RunExecutionResult>()
    const execute = vi.fn<RunExecutor>(() => finish.promise)
    const coordinator = coordinatorFor(fixture, execute)
    const command = {
      baseUrl: 'http://fixture.invalid',
      compactionPercent: 42,
      imageModel: 'openrouter/test/image',
      projectId: project.id,
      prompt: '  Build an amber page.  ',
      textModel: 'openrouter/test/model',
      turnId: 'turn-same',
      visionModel: 'openrouter/test/vision',
    }

    const first = coordinator.start(command)
    const {
      compactionPercent: _omittedCompaction,
      imageModel: _omittedImageModel,
      textModel: _omittedTextModel,
      visionModel: _omittedVisionModel,
      ...omittedRetry
    } = command
    const second = coordinator.start(omittedRetry)
    expect(second).toBe(first)
    await expect(first).resolves.toMatchObject({ ok: true })
    expect(execute).toHaveBeenCalledOnce()

    const completion = coordinator.waitForCompletion(project.id, 'turn-same')
    finish.resolve({ outcome: 'completed', stats: { cost: 0 } })
    await expect(completion).resolves.toMatchObject({ outcome: 'completed' })
    const journal = await fixture.runtime.repository.readClientJournal(
      project.id,
    )
    expect(
      journal.records.filter((record) => record.lifecycle === 'run_accepted'),
    ).toHaveLength(1)
    expect(
      journal.records.filter((record) => record.event === 'run_terminal'),
    ).toHaveLength(1)
  })

  it('rejects changed ordered content and preserves stored defaults on retry', async () => {
    const fixture = await runtimeFixture()
    const project = await fixture.runtime.repository.createProject()
    const execute = vi.fn<RunExecutor>(async () => ({
      outcome: 'completed' as const,
      stats: null,
    }))
    const first = coordinatorFor(fixture, execute, {
      defaultImageModel: 'image/a',
      defaultTextModel: 'text/a',
      defaultVisionModel: 'vision/a',
    })
    await first.start({
      attachments: [
        { kind: 'element', selector: '#hero' },
        { kind: 'element', selector: '#cta' },
      ],
      baseUrl: 'http://fixture.invalid',
      projectId: project.id,
      prompt: 'Build',
      turnId: 'turn-defaults',
    })
    await first.waitForIdle()

    await fixture.runtime.repository.flushProjectLogs(project.id)
    const reopened = reopenRepository(fixture.dataDir)
    const reconstructed = ownCoordinator(
      createRunCoordinator({
        bus: createRunBus(),
        defaultImageModel: 'image/b',
        defaultTextModel: 'text/b',
        defaultVisionModel: 'vision/b',
        drainGraceMs: 10,
        execute,
        operationTimeoutMs: 1_000,
        repository: reopened,
      }),
    )
    await expect(
      reconstructed.start({
        attachments: [
          { kind: 'element', selector: '#hero' },
          { kind: 'element', selector: '#cta' },
        ],
        baseUrl: 'http://fixture.invalid',
        projectId: project.id,
        prompt: 'Build',
        turnId: 'turn-defaults',
      }),
    ).resolves.toMatchObject({ existing: true, ok: true })
    await expect(
      reconstructed.start({
        attachments: [
          { kind: 'element', selector: '#cta' },
          { kind: 'element', selector: '#hero' },
        ],
        baseUrl: 'http://fixture.invalid',
        projectId: project.id,
        prompt: 'Build',
        turnId: 'turn-defaults',
      }),
    ).resolves.toEqual({ ok: false, reason: 'conflict' })
    expect(execute).toHaveBeenCalledOnce()
  })

  it('digests attachment bytes and effective models without storing inline data', async () => {
    const fixture = await runtimeFixture()
    const project = await fixture.runtime.repository.createProject()
    const finish = deferred<RunExecutionResult>()
    const execute = vi.fn<RunExecutor>(async () => {
      const journal = await fixture.runtime.repository.readClientJournal(
        project.id,
      )
      expect(
        journal.records.some((record) => record.lifecycle === 'run_accepted'),
      ).toBe(true)
      return finish.promise
    })
    const coordinator = coordinatorFor(fixture, execute)
    const attachment = (contents: string) => {
      const bytes = Buffer.from(contents)
      return {
        dataUrl: `data:image/png;base64,${bytes.toString('base64')}`,
        id: 'client-reference',
        mediaType: 'image/png' as const,
        name: 'reference.png',
        size: bytes.byteLength,
      }
    }
    const first = await coordinator.start({
      attachments: [attachment('first bytes')],
      baseUrl: 'http://fixture.invalid',
      projectId: project.id,
      prompt: 'Use these bytes',
      textModel: 'text/selected',
      turnId: 'turn-byte-digest',
    })
    expect(first.ok).toBe(true)

    await expect(
      coordinator.start({
        attachments: [attachment('changed bytes')],
        baseUrl: 'http://fixture.invalid',
        projectId: project.id,
        prompt: 'Use these bytes',
        textModel: 'text/selected',
        turnId: 'turn-byte-digest',
      }),
    ).resolves.toEqual({ ok: false, reason: 'conflict' })
    await expect(
      coordinator.start({
        attachments: [attachment('first bytes')],
        baseUrl: 'http://fixture.invalid',
        projectId: project.id,
        prompt: 'Use these bytes',
        textModel: 'text/changed',
        turnId: 'turn-byte-digest',
      }),
    ).resolves.toEqual({ ok: false, reason: 'conflict' })

    const journal = await fixture.runtime.repository.readClientJournal(
      project.id,
    )
    const serialized = JSON.stringify(
      journal.records.find((record) => record.lifecycle === 'run_accepted'),
    )
    expect(serialized).not.toContain('data:image')
    expect(serialized).not.toContain(
      Buffer.from('first bytes').toString('base64'),
    )
    finish.resolve({ outcome: 'completed', stats: null })
    await coordinator.waitForIdle()
  })

  it('releases a provisional claim when acceptance is not committed', async () => {
    const fixture = await runtimeFixture()
    const project = await fixture.runtime.repository.createProject()
    const append = fixture.runtime.repository.appendClientMessage.bind(
      fixture.runtime.repository,
    )
    let rejectAcceptance = true
    vi.spyOn(
      fixture.runtime.repository,
      'appendClientMessage',
    ).mockImplementation(async (id, entry) => {
      if (entry.lifecycle === 'run_accepted' && rejectAcceptance) {
        throw new Error('acceptance not committed')
      }
      return append(id, entry)
    })
    const execute = vi.fn<RunExecutor>(async () => ({
      outcome: 'completed' as const,
      stats: null,
    }))
    const coordinator = coordinatorFor(fixture, execute)

    await expect(
      coordinator.start({
        baseUrl: 'http://fixture.invalid',
        projectId: project.id,
        prompt: 'First attempt',
        turnId: 'turn-precommit-failure',
      }),
    ).rejects.toThrow('not committed')
    expect(execute).not.toHaveBeenCalled()
    expect(fixture.runtime.runBus.getRun(project.id)).toBeUndefined()

    rejectAcceptance = false
    await expect(
      coordinator.start({
        baseUrl: 'http://fixture.invalid',
        projectId: project.id,
        prompt: 'Second attempt',
        turnId: 'turn-after-precommit-failure',
      }),
    ).resolves.toMatchObject({ ok: true })
    await expect(coordinator.waitForIdle()).rejects.toThrow(
      'Landing agent runner operations failed',
    )
    await expect(coordinator.waitForIdle()).resolves.toBeUndefined()
    expect(execute).toHaveBeenCalledOnce()
  })

  it('bounds stop when execution ignores abort and does not recover a live owner', async () => {
    const fixture = await runtimeFixture()
    const project = await fixture.runtime.repository.createProject()
    const execution = deferred<RunExecutionResult>()
    const coordinator = coordinatorFor(fixture, () => execution.promise, {
      drainGraceMs: 5,
    })
    await coordinator.start({
      baseUrl: 'http://fixture.invalid',
      projectId: project.id,
      prompt: 'Never settle',
      textModel: 'text/model',
      turnId: 'turn-blocked',
    })

    await expect(coordinator.recover()).resolves.toBe(0)
    await expect(coordinator.stop(project.id)).resolves.toMatchObject({
      outcome: 'blocked',
      stopped: false,
    })
    await expect(coordinator.recover()).resolves.toBe(0)
    expect(fixture.runtime.runBus.getRun(project.id)).toBeDefined()
    await vi.waitFor(async () => {
      await expect(
        fixture.runtime.repository.getProject(project.id),
      ).resolves.toMatchObject({ runBlocked: true, status: 'error' })
    })
    execution.resolve({ outcome: 'stopped', stats: null })
    await vi.waitFor(() => {
      expect(fixture.runtime.runBus.getRun(project.id)).toBeUndefined()
    })
  })

  it('does not launch provider work when stopped during provisional acceptance', async () => {
    const fixture = await runtimeFixture()
    const project = await fixture.runtime.repository.createProject()
    const append = fixture.runtime.repository.appendClientMessage.bind(
      fixture.runtime.repository,
    )
    const entered = deferred<void>()
    const release = deferred<void>()
    vi.spyOn(
      fixture.runtime.repository,
      'appendClientMessage',
    ).mockImplementation(async (id, entry) => {
      if (entry.lifecycle === 'run_accepted') {
        entered.resolve()
        await release.promise
      }
      return append(id, entry)
    })
    const execute = vi.fn<RunExecutor>(async () => ({
      outcome: 'completed' as const,
      stats: null,
    }))
    const coordinator = coordinatorFor(fixture, execute, { drainGraceMs: 5 })
    const starting = coordinator.start({
      baseUrl: 'http://fixture.invalid',
      projectId: project.id,
      prompt: 'Delayed acceptance',
      turnId: 'turn-provisional',
    })
    await entered.promise
    const stopping = coordinator.stop(project.id)
    await expect(stopping).resolves.toMatchObject({ outcome: 'blocked' })
    release.resolve()
    await expect(starting).resolves.toMatchObject({ ok: true })
    await vi.waitFor(async () => {
      const journal = await fixture.runtime.repository.readClientJournal(
        project.id,
      )
      expect(
        journal.records.filter((record) => record.event === 'run_terminal'),
      ).toHaveLength(1)
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it('coalesces repeated Stop and commits one error terminal after late settlement', async () => {
    const fixture = await runtimeFixture()
    const project = await fixture.runtime.repository.createProject()
    const execution = deferred<RunExecutionResult>()
    const coordinator = coordinatorFor(fixture, () => execution.promise, {
      drainGraceMs: 5,
    })
    await coordinator.start({
      baseUrl: 'http://fixture.invalid',
      projectId: project.id,
      prompt: 'Settle later',
      turnId: 'turn-late',
    })

    const [first, second] = await Promise.all([
      coordinator.stop(project.id),
      coordinator.stop(project.id),
    ])
    expect(first.outcome).toBe('blocked')
    expect(second.outcome).toBe('blocked')
    execution.resolve({
      outcome: 'stopped',
      reason: 'stopped',
      stats: { cost: 0.42 },
    })
    await vi.waitFor(async () => {
      const journal = await fixture.runtime.repository.readClientJournal(
        project.id,
      )
      expect(
        journal.records.filter(
          (record) =>
            record.event === 'run_terminal' && record.turnId === 'turn-late',
        ),
      ).toHaveLength(1)
    })
    const journal = await fixture.runtime.repository.readClientJournal(
      project.id,
    )
    expect(
      journal.records.find((record) => record.event === 'run_terminal')
        ?.payload,
    ).toMatchObject({ outcome: 'error', stats: { cost: 0.42 } })
    expect(fixture.runtime.runBus.getRun(project.id)).toBeUndefined()
  })

  it('terminalizes a blocked run when its late execution rejects', async () => {
    const fixture = await runtimeFixture()
    const project = await fixture.runtime.repository.createProject()
    const execution = deferred<RunExecutionResult>()
    const coordinator = coordinatorFor(fixture, () => execution.promise, {
      drainGraceMs: 5,
    })
    await coordinator.start({
      baseUrl: 'http://fixture.invalid',
      projectId: project.id,
      prompt: 'Reject later',
      turnId: 'turn-late-rejection',
    })

    await expect(coordinator.stop(project.id)).resolves.toMatchObject({
      outcome: 'blocked',
      stopped: false,
    })
    execution.reject(new DOMException('Late abort', 'AbortError'))
    await vi.waitFor(async () => {
      const journal = await fixture.runtime.repository.readClientJournal(
        project.id,
      )
      expect(
        journal.records.filter((record) => record.event === 'run_terminal'),
      ).toHaveLength(1)
    })
    const journal = await fixture.runtime.repository.readClientJournal(
      project.id,
    )
    expect(
      journal.records.find((record) => record.event === 'run_terminal')
        ?.payload,
    ).toMatchObject({ outcome: 'error', reason: 'Late abort' })
    expect(fixture.runtime.runBus.getRun(project.id)).toBeUndefined()
  })

  it('terminalizes a blocked run when its nested settlement rejects', async () => {
    const fixture = await runtimeFixture()
    const project = await fixture.runtime.repository.createProject()
    const settlement = deferred<{
      reason?: string
      stats: null | Record<string, unknown>
    }>()
    const coordinator = coordinatorFor(fixture, async () => ({
      knownUsage: null,
      outcome: 'blocked',
      reason: 'Initial drain failure',
      settlement: settlement.promise,
    }))
    await coordinator.start({
      baseUrl: 'http://fixture.invalid',
      projectId: project.id,
      prompt: 'Reject nested settlement',
      turnId: 'turn-rejected-settlement',
    })
    await expect(
      coordinator.waitForCompletion(project.id, 'turn-rejected-settlement'),
    ).resolves.toMatchObject({ outcome: 'blocked' })

    settlement.reject(new Error('Late metadata failed'))
    await vi.waitFor(async () => {
      const journal = await fixture.runtime.repository.readClientJournal(
        project.id,
      )
      expect(
        journal.records.filter((record) => record.event === 'run_terminal'),
      ).toHaveLength(1)
    })
    const journal = await fixture.runtime.repository.readClientJournal(
      project.id,
    )
    expect(
      journal.records.find((record) => record.event === 'run_terminal')
        ?.payload,
    ).toMatchObject({ outcome: 'error', reason: 'Late metadata failed' })
    expect(fixture.runtime.runBus.getRun(project.id)).toBeUndefined()
  })

  it('coalesces Stop with an in-flight terminal commit', async () => {
    const fixture = await runtimeFixture()
    const project = await fixture.runtime.repository.createProject()
    const append = fixture.runtime.repository.appendClientMessage.bind(
      fixture.runtime.repository,
    )
    const terminalEntered = deferred<void>()
    const releaseTerminal = deferred<void>()
    let terminalCalls = 0
    vi.spyOn(
      fixture.runtime.repository,
      'appendClientMessage',
    ).mockImplementation(async (id, entry) => {
      if (entry.event === 'run_terminal') {
        terminalCalls += 1
        terminalEntered.resolve()
        await releaseTerminal.promise
      }
      return append(id, entry)
    })
    const coordinator = coordinatorFor(
      fixture,
      async () => ({ outcome: 'completed', stats: { cost: 0.25 } }),
      { drainGraceMs: 5 },
    )
    await coordinator.start({
      baseUrl: 'http://fixture.invalid',
      projectId: project.id,
      prompt: 'Pause terminal commit',
      turnId: 'turn-terminal-race',
    })
    await terminalEntered.promise

    await expect(coordinator.stop(project.id)).resolves.toMatchObject({
      outcome: 'blocked',
      stopped: false,
    })
    expect(fixture.runtime.runBus.getRun(project.id)).toBeDefined()
    releaseTerminal.resolve()
    await coordinator.waitForIdle()

    const journal = await fixture.runtime.repository.readClientJournal(
      project.id,
    )
    const terminals = journal.records.filter(
      (record) => record.event === 'run_terminal',
    )
    expect(terminalCalls).toBe(1)
    expect(terminals).toHaveLength(1)
    expect(terminals[0]?.payload).toMatchObject({ outcome: 'completed' })
    expect(
      journal.records.filter((record) => record.event === 'run_blocked'),
    ).toHaveLength(0)
  })

  it('retains provider ownership when the execution adapter rejects', async () => {
    const fixture = await runtimeFixture()
    const project = await fixture.runtime.repository.createProject()
    const releaseProvider = deferred<void>()
    let providerSettled = false
    const coordinator = coordinatorFor(
      fixture,
      async ({ operations }) => {
        void operations
          .run('late-provider', async () => {
            await releaseProvider.promise
            providerSettled = true
          })
          .catch(() => {})
        throw new Error('execution adapter failed')
      },
      { drainGraceMs: 5 },
    )
    await coordinator.start({
      baseUrl: 'http://fixture.invalid',
      projectId: project.id,
      prompt: 'Reject with owned work',
      turnId: 'turn-rejected-adapter',
    })

    await expect(coordinator.waitForIdle()).rejects.toThrow(
      'Landing agent runner operations failed',
    )
    expect(providerSettled).toBe(false)
    expect(fixture.runtime.runBus.getRun(project.id)).toBeDefined()
    let terminal = await fixture.runtime.repository.readClientJournal(
      project.id,
    )
    expect(
      terminal.records.filter((record) => record.event === 'run_terminal'),
    ).toHaveLength(0)

    releaseProvider.resolve()
    await vi.waitFor(async () => {
      terminal = await fixture.runtime.repository.readClientJournal(project.id)
      expect(
        terminal.records.filter((record) => record.event === 'run_terminal'),
      ).toHaveLength(1)
    })
    expect(providerSettled).toBe(true)
    expect(fixture.runtime.runBus.getRun(project.id)).toBeUndefined()
  })

  it('recovers the newest open legacy turn once in mixed history', async () => {
    const fixture = await runtimeFixture()
    const project = await fixture.runtime.repository.createProject()
    await fixture.runtime.repository.appendClientMessage(project.id, {
      attachments: [],
      compactionPercent: null,
      dir: 'in',
      imageModel: 'image/model',
      lifecycle: 'run_accepted',
      model: 'text/model',
      prompt: 'Old canonical',
      requestDigest: 'digest',
      requestVersion: 1,
      ts: '2026-09-06T00:00:00.000Z',
      turnId: 'turn-old',
      type: 'prompt',
      visionModel: 'vision/model',
    })
    await fixture.runtime.repository.appendClientMessage(project.id, {
      dir: 'out',
      event: 'run_terminal',
      payload: {
        finishedAt: '2026-09-06T00:00:01.000Z',
        outcome: 'completed',
        stats: null,
        turnId: 'turn-old',
      },
      ts: '2026-09-06T00:00:01.000Z',
      turnId: 'turn-old',
    })
    await fixture.runtime.repository.appendClientMessage(project.id, {
      dir: 'in',
      model: 'text/model',
      prompt: 'New legacy prompt',
      ts: '2026-09-06T00:00:02.000Z',
      type: 'prompt',
    })
    fixture.runtime.repository.setRunStatusSync(project.id, {
      status: 'running',
      turnId: 'legacy-state',
    })
    const coordinator = coordinatorFor(fixture, async () => ({
      outcome: 'completed',
      stats: null,
    }))

    await expect(coordinator.recover()).resolves.toBe(1)
    await expect(coordinator.recover()).resolves.toBe(0)
    const journal = await fixture.runtime.repository.readClientJournal(
      project.id,
    )
    const terminals = journal.records.filter(
      (record) => record.event === 'run_terminal',
    )
    expect(terminals).toHaveLength(2)
    expect(terminals.at(-1)?.payload).toMatchObject({ outcome: 'interrupted' })
    await expect(
      fixture.runtime.repository.getProject(project.id),
    ).resolves.toMatchObject({
      messages: expect.arrayContaining([
        expect.objectContaining({
          error: 'Server restarted while run was active.',
          isStreaming: false,
          prompt: 'New legacy prompt',
        }),
      ]),
    })
  })

  it('recovers accepted work through a fresh repository over the same disk', async () => {
    const fixture = await runtimeFixture()
    const project = await fixture.runtime.repository.createProject()
    await fixture.runtime.repository.appendClientMessage(project.id, {
      attachments: [],
      compactionPercent: null,
      dir: 'in',
      imageModel: 'image/model',
      lifecycle: 'run_accepted',
      model: 'text/model',
      prompt: 'Persist across reconstruction',
      requestDigest: 'digest',
      requestVersion: 1,
      ts: '2026-09-06T00:00:00.000Z',
      turnId: 'turn-reopen',
      type: 'prompt',
      visionModel: 'vision/model',
    })
    await fixture.runtime.repository.flushProjectLogs(project.id)
    const repository = reopenRepository(fixture.dataDir)
    const coordinator = ownCoordinator(
      createRunCoordinator({
        bus: createRunBus(),
        defaultImageModel: 'image/model',
        defaultTextModel: 'text/model',
        defaultVisionModel: 'vision/model',
        drainGraceMs: 10,
        execute: async () => ({ outcome: 'completed', stats: null }),
        operationTimeoutMs: 1_000,
        repository,
      }),
    )

    await expect(coordinator.recover()).resolves.toBe(1)
    const journal = await repository.readClientJournal(project.id)
    expect(journal.records.at(-1)?.payload).toMatchObject({
      outcome: 'interrupted',
      turnId: 'turn-reopen',
    })
  })

  it('repairs a stale projection from an existing canonical terminal', async () => {
    const fixture = await runtimeFixture()
    const project = await fixture.runtime.repository.createProject()
    await fixture.runtime.repository.appendClientMessage(project.id, {
      attachments: [],
      compactionPercent: null,
      dir: 'in',
      imageModel: 'image/model',
      lifecycle: 'run_accepted',
      model: 'text/model',
      prompt: 'Already finished',
      requestDigest: 'digest',
      requestVersion: 1,
      ts: '2026-09-06T00:00:00.000Z',
      turnId: 'turn-already-terminal',
      type: 'prompt',
      visionModel: 'vision/model',
    })
    await fixture.runtime.repository.appendClientMessage(project.id, {
      dir: 'out',
      event: 'run_terminal',
      payload: {
        finishedAt: '2026-09-06T00:00:01.000Z',
        outcome: 'completed',
        stats: { cost: 0.1 },
        turnId: 'turn-already-terminal',
      },
      ts: '2026-09-06T00:00:01.000Z',
      turnId: 'turn-already-terminal',
    })
    fixture.runtime.repository.setRunStatusSync(project.id, {
      status: 'running',
      turnId: 'turn-already-terminal',
    })
    await fixture.runtime.repository.flushProjectLogs(project.id)
    const repository = reopenRepository(fixture.dataDir)
    const coordinator = ownCoordinator(
      createRunCoordinator({
        bus: createRunBus(),
        defaultImageModel: 'image/model',
        defaultTextModel: 'text/model',
        defaultVisionModel: 'vision/model',
        drainGraceMs: 10,
        execute: async () => ({ outcome: 'completed', stats: null }),
        operationTimeoutMs: 1_000,
        repository,
      }),
    )

    await expect(coordinator.recover()).resolves.toBe(1)
    await expect(coordinator.recover()).resolves.toBe(0)
    expect(repository.readRunStateSync(project.id)).toMatchObject({
      status: 'idle',
      turnId: 'turn-already-terminal',
    })
    const journal = await repository.readClientJournal(project.id)
    expect(
      journal.records.filter((record) => record.event === 'run_terminal'),
    ).toHaveLength(1)
  })

  it('retains accepted attachment bytes when append reports an uncertain failure', async () => {
    const fixture = await runtimeFixture()
    const project = await fixture.runtime.repository.createProject()
    const append = fixture.runtime.repository.appendClientMessage.bind(
      fixture.runtime.repository,
    )
    vi.spyOn(
      fixture.runtime.repository,
      'appendClientMessage',
    ).mockImplementation(async (id, entry) => {
      const committed = await append(id, entry)
      if (entry.lifecycle === 'run_accepted') {
        throw new Error('commit outcome uncertain')
      }
      return committed
    })
    const coordinator = coordinatorFor(fixture, async () => ({
      outcome: 'completed',
      stats: null,
    }))
    const bytes = Buffer.from('accepted-image')

    await expect(
      coordinator.start({
        attachments: [
          {
            dataUrl: `data:image/png;base64,${bytes.toString('base64')}`,
            id: 'upload',
            mediaType: 'image/png',
            name: 'reference.png',
            size: bytes.byteLength,
          },
        ],
        baseUrl: 'http://fixture.invalid',
        projectId: project.id,
        prompt: 'Use attachment',
        turnId: 'turn-asset',
      }),
    ).rejects.toThrow('uncertain')
    await expect(coordinator.waitForIdle()).rejects.toThrow(
      'Landing agent runner operations failed',
    )
    const journal = await fixture.runtime.repository.readClientJournal(
      project.id,
    )
    const accepted = journal.records.find(
      (record) => record.lifecycle === 'run_accepted',
    )
    expect(accepted).toBeDefined()
    const acceptedAttachments = accepted?.attachments
    expect(Array.isArray(acceptedAttachments)).toBe(true)
    const assetPath = (acceptedAttachments as { assetPath?: string }[])[0]
      ?.assetPath
    expect(assetPath).toBeTruthy()
    await expect(
      readFile(join(fixture.dataDir, 'projects', project.id, assetPath!)),
    ).resolves.toEqual(bytes)
  })

  it('keeps a partial journal unavailable until explicit repair then recovers it', async () => {
    const fixture = await runtimeFixture()
    const project = await fixture.runtime.repository.createProject()
    await fixture.runtime.repository.appendClientMessage(project.id, {
      dir: 'in',
      model: 'text/model',
      prompt: 'Legacy open prompt',
      ts: '2026-09-06T00:00:00.000Z',
      turnId: 'turn-legacy-tail',
      type: 'prompt',
    })
    await fixture.runtime.repository.flushProjectLogs(project.id)
    await appendFile(
      join(fixture.dataDir, 'projects', project.id, 'client-messages.jsonl'),
      '{"dir":"out","event":"text"',
    )
    const execute = vi.fn<RunExecutor>(async () => ({
      outcome: 'completed' as const,
      stats: null,
    }))
    const coordinator = coordinatorFor(fixture, execute)

    await expect(
      coordinator.start({
        baseUrl: 'http://fixture.invalid',
        projectId: project.id,
        prompt: 'Must wait for repair',
        turnId: 'turn-after-repair',
      }),
    ).resolves.toEqual({ ok: false, reason: 'storage' })
    expect(execute).not.toHaveBeenCalled()
    await fixture.runtime.repository.recoverClientJournal(project.id)
    await expect(coordinator.recover()).resolves.toBe(1)
    await expect(
      coordinator.start({
        baseUrl: 'http://fixture.invalid',
        projectId: project.id,
        prompt: 'Now repaired',
        turnId: 'turn-after-repair',
      }),
    ).resolves.toMatchObject({ ok: true })
    await coordinator.waitForIdle()
  })

  it('reconciles a repaired provisional acceptance without launching it', async () => {
    const fixture = await runtimeFixture()
    const project = await fixture.runtime.repository.createProject()
    const append = fixture.runtime.repository.appendClientMessage.bind(
      fixture.runtime.repository,
    )
    const readJournal = fixture.runtime.repository.readClientJournal.bind(
      fixture.runtime.repository,
    )
    let journalReads = 0
    vi.spyOn(
      fixture.runtime.repository,
      'readClientJournal',
    ).mockImplementation(async (id) => {
      journalReads += 1
      if (journalReads === 2) throw new Error('journal temporarily unreadable')
      return readJournal(id)
    })
    vi.spyOn(
      fixture.runtime.repository,
      'appendClientMessage',
    ).mockImplementation(async (id, entry) => {
      const committed = await append(id, entry)
      if (entry.lifecycle === 'run_accepted') {
        throw new Error('acceptance outcome uncertain')
      }
      return committed
    })
    const execute = vi.fn<RunExecutor>(async () => ({
      outcome: 'completed' as const,
      stats: null,
    }))
    const coordinator = coordinatorFor(fixture, execute)

    await expect(
      coordinator.start({
        baseUrl: 'http://fixture.invalid',
        projectId: project.id,
        prompt: 'Uncertain acceptance',
        turnId: 'turn-provisional-repair',
      }),
    ).rejects.toThrow('uncertain')
    vi.mocked(fixture.runtime.repository.readClientJournal).mockImplementation(
      readJournal,
    )
    vi.mocked(
      fixture.runtime.repository.appendClientMessage,
    ).mockImplementation(append)

    await expect(coordinator.recover()).resolves.toBe(1)
    await expect(coordinator.waitForIdle()).rejects.toThrow(
      'Landing agent runner operations failed',
    )
    expect(execute).not.toHaveBeenCalled()
    expect(fixture.runtime.runBus.getRun(project.id)).toBeUndefined()
    const journal = await readJournal(project.id)
    expect(journal.records.at(-1)?.payload).toMatchObject({
      outcome: 'interrupted',
      turnId: 'turn-provisional-repair',
    })
  })

  it('surfaces a terminal append failure and repairs the accepted turn once', async () => {
    const fixture = await runtimeFixture()
    const project = await fixture.runtime.repository.createProject()
    const append = fixture.runtime.repository.appendClientMessage.bind(
      fixture.runtime.repository,
    )
    let failTerminal = true
    vi.spyOn(
      fixture.runtime.repository,
      'appendClientMessage',
    ).mockImplementation(async (id, entry) => {
      if (entry.event === 'run_terminal' && failTerminal) {
        throw new Error('terminal journal unavailable')
      }
      return append(id, entry)
    })
    const coordinator = coordinatorFor(fixture, async () => ({
      outcome: 'completed',
      stats: { cost: 0 },
    }))
    await coordinator.start({
      baseUrl: 'http://fixture.invalid',
      projectId: project.id,
      prompt: 'Commit once',
      turnId: 'turn-terminal-fault',
    })

    await expect(coordinator.waitForIdle()).rejects.toThrow(
      'Landing agent runner operations failed',
    )
    await expect(
      coordinator.start({
        baseUrl: 'http://fixture.invalid',
        projectId: project.id,
        prompt: 'Different run',
        turnId: 'turn-next',
      }),
    ).resolves.toEqual({ ok: false, reason: 'storage' })
    failTerminal = false
    await expect(coordinator.recover()).resolves.toBe(1)
    await expect(coordinator.recover()).resolves.toBe(0)
    const journal = await fixture.runtime.repository.readClientJournal(
      project.id,
    )
    expect(
      journal.records.filter(
        (record) =>
          record.event === 'run_terminal' &&
          record.turnId === 'turn-terminal-fault',
      ),
    ).toHaveLength(1)
  })
})

function coordinatorFor(
  fixture: RuntimeFixture,
  execute: Parameters<typeof createRunCoordinator>[0]['execute'],
  overrides: Partial<Parameters<typeof createRunCoordinator>[0]> = {},
) {
  return ownCoordinator(
    createRunCoordinator({
      bus: fixture.runtime.runBus,
      defaultImageModel: 'image/model',
      defaultTextModel: 'text/model',
      defaultVisionModel: 'vision/model',
      drainGraceMs: 10,
      execute,
      operationTimeoutMs: 1_000,
      repository: fixture.runtime.repository,
      ...overrides,
    }),
  )
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept
    reject = decline
  })
  return { promise, reject, resolve }
}

function ownCoordinator(coordinator: RunCoordinator): RunCoordinator {
  coordinators.push(coordinator)
  return coordinator
}

function reopenRepository(dataDir: string) {
  const repository = createProjectRepository({
    dataDir,
    fileSystem: createProjectFileSystem(dataDir),
    imageStore: createImageStore(),
    logger() {},
    runBus: createRunBus(),
  })
  repositories.push(repository)
  return repository
}

async function runtimeFixture() {
  const fixture = await createRuntimeFixture()
  fixtures.push(fixture)
  return fixture
}
