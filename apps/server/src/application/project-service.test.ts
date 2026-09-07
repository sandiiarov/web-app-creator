import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createImageStore } from '../mastra/lib/image-store.ts'
import { createProjectFileSystem } from '../mastra/lib/project-filesystem.ts'
import { ProjectFileCommitError } from '../mastra/lib/project-store.ts'
import { createProjectRepository } from '../mastra/lib/project-store.ts'
import { createRunBus } from '../mastra/lib/run-bus.ts'
import {
  createRuntimeFixture,
  type RuntimeFixture,
} from '../testing/runtime-fixture.ts'
import { createProjectService } from './project-service.ts'
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

describe('project service', () => {
  it('persists deletion intent before memory and files, then blocks keyed recreation', async () => {
    const fixture = await runtimeFixture()
    const creationKey = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const project = await fixture.runtime.repository.createProject({
      creationKey,
    })
    const calls: string[] = []
    const repository = fixture.runtime.repository
    const writeTombstone = repository.writeProjectTombstone.bind(repository)
    vi.spyOn(repository, 'writeProjectTombstone').mockImplementation(
      async (id, state) => {
        calls.push(`intent:${state}`)
        return writeTombstone(id, state)
      },
    )
    const deleteFiles = repository.deleteProject.bind(repository)
    vi.spyOn(repository, 'deleteProject').mockImplementation(async (id) => {
      calls.push('files')
      return deleteFiles(id)
    })
    const memory = {
      async deleteProjectMemory() {
        calls.push('memory')
      },
    }
    const coordinator = coordinatorFor(fixture)
    const service = createProjectService({ coordinator, memory, repository })

    await service.delete(project.id)

    expect(calls).toEqual([
      'intent:deleting',
      'memory',
      'files',
      'intent:completed',
    ])
    await expect(repository.getProject(project.id)).resolves.toBeNull()
    expect(repository.readProjectTombstoneSync(project.id)).toMatchObject({
      state: 'completed',
    })
    await expect(service.create({ creationKey })).rejects.toThrow('deleted')
  })

  it('revokes old HTML stores and drains queued mutations before removal', async () => {
    const fixture = await runtimeFixture()
    const project = await fixture.runtime.repository.createProject()
    const oldStore = fixture.runtime.repository.createProjectHtmlStore(
      project.id,
    )
    const service = createProjectService({
      coordinator: coordinatorFor(fixture),
      memory: { async deleteProjectMemory() {} },
      repository: fixture.runtime.repository,
    })
    const queued = fixture.runtime.repository.saveProjectMessageTurn(
      project.id,
      {
        htmlSwaps: 0,
        id: 'queued-turn',
        isStreaming: false,
        model: 'text/model',
        parts: [],
        prompt: 'queued',
      },
    )
    const deleting = service.delete(project.id)

    await expect(queued).rejects.toThrow('mutations are blocked')
    await expect(deleting).resolves.toBeUndefined()
    expect(() => oldStore.set('<html>late</html>')).toThrow(
      'mutations are blocked',
    )
    expect(() =>
      fixture.runtime.repository.createProjectHtmlStore(project.id),
    ).toThrow('mutations are blocked')
    expect(() =>
      fixture.runtime.repository.appendClientMessage(project.id, {
        dir: 'out',
        event: 'text',
        payload: { delta: 'late' },
        ts: new Date().toISOString(),
        turnId: 'queued-turn',
      }),
    ).toThrow('mutations are blocked')
    expect(() =>
      fixture.runtime.repository.setRunStatusSync(project.id, {
        status: 'error',
      }),
    ).toThrow('mutations are blocked')
    await expect(
      fixture.runtime.repository.getProject(project.id),
    ).resolves.toBeNull()

    const staleDir = join(fixture.dataDir, 'projects', project.id)
    await mkdir(staleDir, { recursive: true })
    await writeFile(
      join(staleDir, 'project.json'),
      JSON.stringify({
        createdAt: new Date().toISOString(),
        hasHtml: true,
        id: project.id,
        imageModel: '',
        model: '',
        title: 'Stale legacy project',
        updatedAt: new Date().toISOString(),
        visionModel: '',
      }),
    )
    await writeFile(join(staleDir, 'index.html'), '<html>stale</html>')
    await expect(
      fixture.runtime.repository.getProject(project.id),
    ).rejects.toThrow('mutations are blocked')
    expect(existsSync(join(staleDir, 'html.json'))).toBe(false)
    await rm(staleDir, { force: true, recursive: true })
  })

  it('keeps the tombstone and retries memory cleanup before deleting files', async () => {
    const fixture = await runtimeFixture()
    const project = await fixture.runtime.repository.createProject()
    let memoryCalls = 0
    const memory = {
      async deleteProjectMemory() {
        memoryCalls += 1
        if (memoryCalls === 1) throw new Error('memory unavailable')
      },
    }
    const coordinator = coordinatorFor(fixture)
    const service = createProjectService({
      coordinator,
      memory,
      repository: fixture.runtime.repository,
    })

    await expect(service.delete(project.id)).rejects.toThrow(
      'memory unavailable',
    )
    await expect(
      fixture.runtime.repository.getProject(project.id),
    ).resolves.not.toBeNull()
    expect(
      fixture.runtime.repository.readProjectTombstoneSync(project.id),
    ).toMatchObject({
      state: 'deleting',
    })
    await expect(service.delete(project.id)).resolves.toBeUndefined()
    expect(memoryCalls).toBe(2)
  })

  it('resumes after a filesystem deletion failure without reopening writes', async () => {
    const fixture = await runtimeFixture()
    const project = await fixture.runtime.repository.createProject()
    const removeFiles = fixture.runtime.repository.deleteProject.bind(
      fixture.runtime.repository,
    )
    let attempts = 0
    vi.spyOn(fixture.runtime.repository, 'deleteProject').mockImplementation(
      async (id) => {
        attempts += 1
        if (attempts === 1) throw new Error('filesystem unavailable')
        return removeFiles(id)
      },
    )
    const service = createProjectService({
      coordinator: coordinatorFor(fixture),
      memory: { async deleteProjectMemory() {} },
      repository: fixture.runtime.repository,
    })

    await expect(service.delete(project.id)).rejects.toThrow(
      'filesystem unavailable',
    )
    expect(() =>
      fixture.runtime.repository.createProjectHtmlStore(project.id),
    ).toThrow('mutations are blocked')
    await expect(service.delete(project.id)).resolves.toBeUndefined()
    expect(attempts).toBe(2)
    await expect(
      fixture.runtime.repository.getProject(project.id),
    ).resolves.toBeNull()
  })

  it('reconstructs and completes an interrupted deletion idempotently', async () => {
    const fixture = await runtimeFixture()
    const project = await fixture.runtime.repository.createProject()
    await fixture.runtime.repository.writeProjectTombstone(
      project.id,
      'deleting',
    )
    await fixture.runtime.repository.flushProjectLogs(project.id)
    const repository = reopenRepository(fixture.dataDir)
    const memory = {
      deleteProjectMemory: vi.fn<(projectId: string) => Promise<void>>(
        async () => {},
      ),
    }
    const service = createProjectService({
      coordinator: ownCoordinator(
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
      ),
      memory,
      repository,
    })

    await expect(service.recover()).resolves.toBe(1)
    await expect(service.recover()).resolves.toBe(0)
    expect(memory.deleteProjectMemory).toHaveBeenCalledOnce()
    await expect(repository.getProject(project.id)).resolves.toBeNull()
  })

  it('does not delete while an abort-ignoring run remains blocked', async () => {
    const fixture = await runtimeFixture()
    const project = await fixture.runtime.repository.createProject()
    const execution = deferred<RunExecutionResult>()
    const coordinator = ownCoordinator(
      createRunCoordinator({
        bus: fixture.runtime.runBus,
        defaultImageModel: 'image/model',
        defaultTextModel: 'text/model',
        defaultVisionModel: 'vision/model',
        drainGraceMs: 5,
        execute: () => execution.promise,
        operationTimeoutMs: 1_000,
        repository: fixture.runtime.repository,
      }),
    )
    const memory = {
      deleteProjectMemory: vi.fn<(projectId: string) => Promise<void>>(
        async () => {},
      ),
    }
    const service = createProjectService({
      coordinator,
      memory,
      repository: fixture.runtime.repository,
    })
    await coordinator.start({
      baseUrl: 'http://fixture.invalid',
      projectId: project.id,
      prompt: 'Keep ownership',
      turnId: 'turn-delete-blocked',
    })

    await expect(service.delete(project.id)).rejects.toThrow(
      'unsettled run work',
    )
    expect(memory.deleteProjectMemory).not.toHaveBeenCalled()
    await expect(
      fixture.runtime.repository.getProject(project.id),
    ).resolves.not.toBeNull()
    expect(
      fixture.runtime.repository.readProjectTombstoneSync(project.id),
    ).toMatchObject({
      state: 'deleting',
    })
    execution.resolve({ outcome: 'stopped', stats: null })
    await vi.waitFor(() => {
      expect(fixture.runtime.runBus.getRun(project.id)).toBeUndefined()
    })
    await expect(service.delete(project.id)).resolves.toBeUndefined()
  })

  it('owns a provisional acceptance through deletion and completes on retry', async () => {
    const fixture = await runtimeFixture()
    const project = await fixture.runtime.repository.createProject()
    const append = fixture.runtime.repository.appendClientMessage.bind(
      fixture.runtime.repository,
    )
    const acceptanceEntered = deferred<void>()
    const releaseAcceptance = deferred<void>()
    vi.spyOn(
      fixture.runtime.repository,
      'appendClientMessage',
    ).mockImplementation(async (id, entry) => {
      if (entry.lifecycle === 'run_accepted') {
        acceptanceEntered.resolve()
        await releaseAcceptance.promise
      }
      return append(id, entry)
    })
    const execute = vi.fn<RunExecutor>(async () => ({
      outcome: 'completed' as const,
      stats: null,
    }))
    const coordinator = ownCoordinator(
      createRunCoordinator({
        bus: fixture.runtime.runBus,
        defaultImageModel: 'image/model',
        defaultTextModel: 'text/model',
        defaultVisionModel: 'vision/model',
        drainGraceMs: 5,
        execute,
        operationTimeoutMs: 1_000,
        repository: fixture.runtime.repository,
      }),
    )
    const memory = {
      deleteProjectMemory: vi.fn<(projectId: string) => Promise<void>>(
        async () => {},
      ),
    }
    const service = createProjectService({
      coordinator,
      memory,
      repository: fixture.runtime.repository,
    })
    const starting = coordinator.start({
      baseUrl: 'http://fixture.invalid',
      projectId: project.id,
      prompt: 'Accept while deleting',
      turnId: 'turn-provisional-delete',
    })
    await acceptanceEntered.promise

    await expect(service.delete(project.id)).rejects.toThrow(
      'unsettled run work',
    )
    expect(memory.deleteProjectMemory).not.toHaveBeenCalled()
    releaseAcceptance.resolve()
    await expect(starting).resolves.toMatchObject({ ok: true })
    await vi.waitFor(() => {
      expect(fixture.runtime.runBus.getRun(project.id)).toBeUndefined()
    })
    await expect(service.delete(project.id)).resolves.toBeUndefined()
    expect(execute).not.toHaveBeenCalled()
    expect(memory.deleteProjectMemory).toHaveBeenCalledOnce()
  })

  it('serializes keyed creation before deletion and rejects delayed reuse', async () => {
    const fixture = await runtimeFixture()
    const creationKey = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    const create = fixture.runtime.repository.createProject.bind(
      fixture.runtime.repository,
    )
    const releaseCreation = deferred<void>()
    vi.spyOn(fixture.runtime.repository, 'createProject').mockImplementation(
      async (input) => {
        await releaseCreation.promise
        return create(input)
      },
    )
    const service = createProjectService({
      coordinator: coordinatorFor(fixture),
      memory: { async deleteProjectMemory() {} },
      repository: fixture.runtime.repository,
    })

    const creating = service.create({ creationKey })
    const deleting = service.delete(creationKey)
    await Promise.resolve()
    expect(
      fixture.runtime.repository.readProjectTombstoneSync(creationKey),
    ).toBeNull()
    releaseCreation.resolve()
    await expect(creating).rejects.toThrow('deleted')
    await expect(deleting).resolves.toBeUndefined()
    await expect(service.create({ creationKey })).rejects.toThrow('deleted')
  })

  it('keeps an unhealthy terminal commit fenced until lifecycle recovery', async () => {
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
    const coordinator = coordinatorFor(fixture)
    const memory = {
      deleteProjectMemory: vi.fn<(projectId: string) => Promise<void>>(
        async () => {},
      ),
    }
    const service = createProjectService({
      coordinator,
      memory,
      repository: fixture.runtime.repository,
    })

    await coordinator.start({
      baseUrl: 'http://fixture.invalid',
      projectId: project.id,
      prompt: 'Finish durably',
      turnId: 'turn-terminal-storage-failure',
    })
    await expect(coordinator.waitForIdle()).rejects.toThrow(
      'Landing agent runner operations failed',
    )
    await expect(service.delete(project.id)).rejects.toThrow(
      'unsettled run work',
    )
    expect(memory.deleteProjectMemory).not.toHaveBeenCalled()
    await expect(
      fixture.runtime.repository.getProject(project.id),
    ).resolves.not.toBeNull()

    failTerminal = false
    await expect(coordinator.recover()).resolves.toBe(1)
    await expect(service.delete(project.id)).resolves.toBeUndefined()
    expect(memory.deleteProjectMemory).toHaveBeenCalledOnce()
  })

  it('rolls back a precommit intent failure but fences an uncertain intent', async () => {
    const fixture = await runtimeFixture()
    const first = await fixture.runtime.repository.createProject({
      creationKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    })
    const second = await fixture.runtime.repository.createProject({
      creationKey: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    })
    const coordinator = coordinatorFor(fixture)
    const service = createProjectService({
      coordinator,
      memory: { async deleteProjectMemory() {} },
      repository: fixture.runtime.repository,
    })
    const tombstone = fixture.runtime.repository.writeProjectTombstone.bind(
      fixture.runtime.repository,
    )
    vi.spyOn(
      fixture.runtime.repository,
      'writeProjectTombstone',
    ).mockRejectedValueOnce(
      new ProjectFileCommitError('not committed', 'notCommitted'),
    )

    await expect(service.delete(first.id)).rejects.toThrow('not committed')
    await expect(
      service.create({ creationKey: first.id }),
    ).resolves.toMatchObject({
      id: first.id,
    })

    vi.mocked(
      fixture.runtime.repository.writeProjectTombstone,
    ).mockRejectedValueOnce(
      new ProjectFileCommitError('uncertain', 'durabilityUncertain'),
    )
    await expect(service.delete(second.id)).rejects.toThrow('uncertain')
    await expect(service.create({ creationKey: second.id })).rejects.toThrow(
      'being deleted',
    )
    vi.mocked(
      fixture.runtime.repository.writeProjectTombstone,
    ).mockImplementation(tombstone)
    await expect(service.delete(second.id)).resolves.toBeUndefined()
  })
})

function coordinatorFor(fixture: RuntimeFixture) {
  return ownCoordinator(
    createRunCoordinator({
      bus: fixture.runtime.runBus,
      defaultImageModel: 'image/model',
      defaultTextModel: 'text/model',
      defaultVisionModel: 'vision/model',
      drainGraceMs: 10,
      execute: async () => ({ outcome: 'completed', stats: null }),
      operationTimeoutMs: 1_000,
      repository: fixture.runtime.repository,
    }),
  )
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
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
