import { mkdtemp, readFile, rm } from 'node:fs/promises'
import type { ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { Agent } from '@mastra/core/agent'
import { Mastra } from '@mastra/core/mastra'
import { LibSQLStore } from '@mastra/libsql'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createLandingMemory } from './mastra/agents/landing-page-agent.ts'
import { deleteLandingMemoryProject } from './mastra/create-mastra-runtime.ts'
import { createProjectFileSystem } from './mastra/lib/project-filesystem.ts'
import {
  createRuntimeFixture,
  type RuntimeFixture,
} from './testing/runtime-fixture.ts'

const fixtures: RuntimeFixture[] = []

function deferred<T = void>() {
  let resolve!: (value: PromiseLike<T> | T) => void
  const promise = new Promise<T>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

function fakeResponse(): ServerResponse {
  return {
    destroyed: false,
    writableEnded: false,
    write: vi.fn<(chunk: string) => boolean>().mockReturnValue(true),
  } as unknown as ServerResponse
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.dispose()))
  vi.unstubAllEnvs()
})

describe('createServerRuntime', () => {
  it('isolates roots, images, runs, subscribers, and recovery scans', async () => {
    const first = await createRuntimeFixture()
    const second = await createRuntimeFixture()
    fixtures.push(first, second)

    const firstProject = await first.runtime.repository.createProject({
      title: 'First',
    })
    const siblingProject = await second.runtime.repository.createProject({
      title: 'Sibling',
    })
    second.runtime.repository.setRunStatusSync(siblingProject.id, {
      startedAt: '2026-09-05T00:00:00.000Z',
      status: 'running',
      turnId: 'turn-sibling',
    })
    expect(
      await second.runtime.repository.getProject(firstProject.id),
    ).toBeNull()

    const firstImage = first.runtime.imageStore.saveImage(
      Buffer.from('first'),
      'image/png',
    )
    expect(second.runtime.imageStore.getImage(firstImage)).toBeUndefined()

    const entry = {
      controller: new AbortController(),
      startedAt: new Date().toISOString(),
      subscribers: new Set<ServerResponse>(),
      turnId: 'turn-a',
    }
    expect(first.runtime.runBus.claimRun(firstProject.id, entry)).toBe(true)
    expect(second.runtime.runBus.getRun(firstProject.id)).toBeUndefined()

    const firstSubscriber = fakeResponse()
    const secondSubscriber = fakeResponse()
    first.runtime.runBus.subscribeProject(firstProject.id, firstSubscriber)
    second.runtime.runBus.subscribeProject(firstProject.id, secondSubscriber)
    first.runtime.runBus.broadcast(firstProject.id, 'text', { delta: 'owned' })
    expect(firstSubscriber.write).toHaveBeenCalledOnce()
    expect(secondSubscriber.write).not.toHaveBeenCalled()

    expect(await first.runtime.agentRunner.recover()).toBe(0)
    const siblingRunState = join(
      second.dataDir,
      'projects',
      siblingProject.id,
      'run-state.json',
    )
    expect(JSON.parse(await readFile(siblingRunState, 'utf8'))).toMatchObject({
      status: 'running',
      turnId: 'turn-sibling',
    })
  })

  it('shares disposal, clears owned state, and rejects later admission or subscriptions', async () => {
    const disposeSdk = vi.fn<() => Promise<void>>(async () => {})
    const fixture = await createRuntimeFixture({
      createAgentSdkRuntime: async () => ({
        createAgent: () => {
          throw new Error('unexpected agent')
        },
        dispose: disposeSdk,
        memory: { async deleteThread() {} },
      }),
    })
    fixtures.push(fixture)
    const imageId = fixture.runtime.imageStore.saveImage(
      Buffer.from('image'),
      'image/png',
    )
    const subscriber = fakeResponse()

    const firstDisposal = fixture.runtime.dispose()
    expect(firstDisposal).toBe(fixture.runtime.dispose())
    await firstDisposal

    expect(disposeSdk).toHaveBeenCalledOnce()
    expect(fixture.runtime.imageStore.getImage(imageId)).toBeUndefined()
    await expect(
      fixture.runtime.agentRunner.start({
        baseUrl: 'http://fixture.invalid',
        projectId: 'missing',
        prompt: 'late',
        textModel: 'fake/model',
      }),
    ).rejects.toThrow('disposed')
    fixture.runtime.runBus.subscribeProject('late', subscriber)
    fixture.runtime.runBus.broadcast('late', 'text', {})
    expect(subscriber.write).not.toHaveBeenCalled()
  })

  it('closes admission across a project lookup paused during disposal', async () => {
    const fixture = await createRuntimeFixture()
    fixtures.push(fixture)
    const project = await fixture.runtime.repository.createProject()
    const entered = deferred()
    const release = deferred()
    const originalGetProject = fixture.runtime.repository.getProject
    fixture.runtime.repository.getProject = async (id) => {
      entered.resolve()
      await release.promise
      return originalGetProject(id)
    }

    const starting = fixture.runtime.agentRunner.start({
      baseUrl: 'http://fixture.invalid',
      projectId: project.id,
      prompt: 'paused',
      textModel: 'fake/model',
    })
    await entered.promise
    const disposing = fixture.runtime.dispose()
    release.resolve()

    await expect(starting).rejects.toThrow('disposed')
    await disposing
    expect(fixture.runtime.runBus.getRun(project.id)).toBeUndefined()
  })

  it('aborts an active stream and waits for its terminal writes before SDK cleanup', async () => {
    const streamStarted = deferred()
    const streamAborted = deferred()
    const finishAfterAbort = deferred()
    const disposeSdk = vi.fn<() => Promise<void>>(async () => {})
    const fixture = await createRuntimeFixture({
      createAgentSdkRuntime: async () => ({
        createAgent: (() => ({
          async stream(
            _message: unknown,
            options: { abortSignal: AbortSignal },
          ) {
            return {
              finishReason: Promise.resolve('stop'),
              fullStream: (async function* () {
                yield* []
                streamStarted.resolve()
                await new Promise<void>((resolveAbort) => {
                  options.abortSignal.addEventListener(
                    'abort',
                    () => resolveAbort(),
                    {
                      once: true,
                    },
                  )
                })
                streamAborted.resolve()
                await finishAfterAbort.promise
              })(),
              usage: Promise.resolve({
                cachedInputTokens: 0,
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
              }),
            }
          },
        })) as never,
        dispose: disposeSdk,
        memory: { async deleteThread() {} },
      }),
    })
    fixtures.push(fixture)
    const project = await fixture.runtime.repository.createProject()
    await expect(
      fixture.runtime.agentRunner.start({
        baseUrl: 'http://fixture.invalid',
        projectId: project.id,
        prompt: 'wait for abort',
        textModel: 'fake/model',
      }),
    ).resolves.toMatchObject({ ok: true })
    await streamStarted.promise

    const disposing = fixture.runtime.dispose()
    await streamAborted.promise
    expect(disposeSdk).not.toHaveBeenCalled()
    finishAfterAbort.resolve()
    await disposing

    expect(disposeSdk).toHaveBeenCalledOnce()
    await expect(
      fixture.runtime.repository.getProject(project.id),
    ).resolves.toMatchObject({
      status: 'stopped',
    })
    await expect(
      fixture.runtime.repository.readClientMessages(project.id),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: 'run_terminal' }),
        expect.objectContaining({ type: 'prompt' }),
      ]),
    )
  })

  it('keeps SDK resources open after a failed disposal until late run work settles', async () => {
    vi.stubEnv('PROVIDER_DRAIN_GRACE_MS', '5')
    const streamStarted = deferred()
    const releaseStream = deferred()
    const disposeSdk = vi.fn<() => Promise<void>>(async () => {})
    const fixture = await createRuntimeFixture({
      createAgentSdkRuntime: async () => ({
        createAgent: (() => ({
          async stream() {
            return {
              finishReason: Promise.resolve('stop'),
              fullStream: (async function* () {
                streamStarted.resolve()
                await releaseStream.promise
                yield* []
              })(),
              messageList: { get: { response: { db: () => [] } } },
              usage: Promise.resolve({
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
              }),
            }
          },
        })) as never,
        dispose: disposeSdk,
        memory: { async deleteThread() {} },
      }),
    })
    fixtures.push(fixture)
    const project = await fixture.runtime.repository.createProject()
    await fixture.runtime.agentRunner.start({
      baseUrl: 'http://fixture.invalid',
      projectId: project.id,
      prompt: 'Ignore abort briefly',
      textModel: 'fake/model',
    })
    await streamStarted.promise

    await expect(fixture.runtime.dispose()).rejects.toThrow(
      'Server runtime disposal failed',
    )
    expect(disposeSdk).not.toHaveBeenCalled()
    releaseStream.resolve()
    await vi.waitFor(() => {
      expect(fixture.runtime.runBus.getRun(project.id)).toBeUndefined()
    })
    await expect(fixture.runtime.dispose()).resolves.toBeUndefined()
    expect(disposeSdk).toHaveBeenCalledOnce()
  })

  it('keeps SDK resources open while project memory deletion is unsettled', async () => {
    vi.stubEnv('PROVIDER_DRAIN_GRACE_MS', '5')
    const memoryDeletionEntered = deferred()
    const releaseMemoryDeletion = deferred()
    const disposeSdk = vi.fn<() => Promise<void>>(async () => {})
    const fixture = await createRuntimeFixture({
      createAgentSdkRuntime: async () => ({
        createAgent: () => {
          throw new Error('unexpected agent')
        },
        async deleteProjectMemory() {
          memoryDeletionEntered.resolve()
          await releaseMemoryDeletion.promise
        },
        dispose: disposeSdk,
        memory: { async deleteThread() {} },
      }),
    })
    fixtures.push(fixture)
    const project = await fixture.runtime.repository.createProject()
    const deleting = fixture.runtime.projectService.delete(project.id)
    await memoryDeletionEntered.promise

    await expect(fixture.runtime.dispose()).rejects.toThrow(
      'Server runtime disposal failed',
    )
    expect(disposeSdk).not.toHaveBeenCalled()
    releaseMemoryDeletion.resolve()
    await deleting
    await expect(fixture.runtime.dispose()).resolves.toBeUndefined()
    expect(disposeSdk).toHaveBeenCalledOnce()
  })

  it('drains production-factory memory processing before project deletion', async () => {
    vi.stubEnv('PROVIDER_DRAIN_GRACE_MS', '5')
    vi.stubEnv('PROVIDER_METADATA_TIMEOUT_MS', '5')
    const observationEntered = deferred()
    const releaseObservation = deferred()
    let delayObservation = false
    let streamCalls = 0
    let agent!: Agent
    let landingMemory!: ReturnType<typeof createLandingMemory>
    const usage = { inputTokens: 2, outputTokens: 2, totalTokens: 4 }
    const observationText = `<observations>
The project prefers amber.
</observations>
<current-task>Build the page</current-task>
<suggested-response>Done.</suggested-response>`
    const model = {
      async doGenerate() {
        if (delayObservation) {
          observationEntered.resolve()
          await releaseObservation.promise
        }
        return {
          content: [{ text: observationText, type: 'text' }],
          finishReason: 'stop',
          usage,
          warnings: [],
        }
      },
      async doStream() {
        streamCalls += 1
        const isObservation = delayObservation && streamCalls === 1
        if (isObservation) {
          observationEntered.resolve()
          await releaseObservation.promise
        }
        return {
          stream: new ReadableStream({
            start(controller) {
              for (const chunk of [
                { type: 'stream-start', warnings: [] },
                { id: 'text', type: 'text-start' },
                {
                  delta: isObservation ? observationText : 'Done.',
                  id: 'text',
                  type: 'text-delta',
                },
                { id: 'text', type: 'text-end' },
                { finishReason: 'stop', type: 'finish', usage },
              ]) {
                controller.enqueue(chunk)
              }
              controller.close()
            },
          }),
        }
      },
      modelId: 'deterministic-memory-lifecycle',
      provider: 'fixture',
      specificationVersion: 'v2',
      supportedUrls: {},
    }
    const fixture = await createRuntimeFixture({
      createAgentSdkRuntime: async ({ memoryStoreUrl }) => {
        const store = new LibSQLStore({
          id: 'memory-lifecycle-test',
          url: memoryStoreUrl,
        })
        await store.init()
        const memory = createLandingMemory({
          options: {
            observationalMemory: {
              model: model as never,
              observation: { bufferTokens: false, messageTokens: 1_000 },
            },
          },
          storage: store,
        })
        landingMemory = memory
        agent = new Agent({
          id: 'memory-lifecycle-agent',
          instructions: 'Respond briefly.',
          memory,
          model: model as never,
          name: 'Memory lifecycle fixture',
        })
        const mastra = new Mastra({
          agents: { memoryLifecycle: agent },
          logger: false,
          storage: store,
        })
        return {
          createAgent: (() => agent) as never,
          deleteProjectMemory: (projectId: string) =>
            deleteLandingMemoryProject(memory, projectId),
          async dispose() {
            await mastra.shutdown()
            await store.close()
          },
          mastra,
          memory,
        }
      },
    })
    fixtures.push(fixture)
    const project = await fixture.runtime.repository.createProject()
    await agent.generate(`Seed project memory. ${'amber '.repeat(1_400)}`, {
      memory: { resource: project.id, thread: project.id },
    })
    const engine = await landingMemory.omEngine
    if (!engine) throw new Error('Expected Observational Memory engine.')
    expect(
      (await engine.getStatus({ resourceId: project.id, threadId: project.id }))
        .shouldObserve,
    ).toBe(true)
    delayObservation = true
    try {
      await fixture.runtime.agentRunner.start({
        baseUrl: 'http://fixture.invalid',
        projectId: project.id,
        prompt: 'Trigger observation.',
        textModel: 'fixture/model',
        turnId: 'turn-memory-delete',
      })
      await Promise.race([
        observationEntered.promise,
        new Promise<never>((_, reject) => {
          const timer = setTimeout(
            () => reject(new Error('Memory observation did not start.')),
            2_000,
          )
          timer.unref()
        }),
      ])

      await expect(
        fixture.runtime.projectService.delete(project.id),
      ).rejects.toThrow('unsettled run work')
      await expect(
        fixture.runtime.repository.getProject(project.id),
      ).resolves.not.toBeNull()
      releaseObservation.resolve()
      await vi.waitFor(() => {
        expect(fixture.runtime.runBus.getRun(project.id)).toBeUndefined()
      })
      await expect(
        fixture.runtime.projectService.delete(project.id),
      ).resolves.toBeUndefined()
      await expect(
        fixture.runtime.repository.getProject(project.id),
      ).resolves.toBeNull()
    } finally {
      releaseObservation.resolve()
    }
  })

  it('waits for every tracked admission before cleanup even when another fails', async () => {
    const cleaned = vi.fn<() => Promise<void>>(async () => {})
    const fixture = await createRuntimeFixture({
      createAgentSdkRuntime: async () => ({
        createAgent: () => {
          throw new Error('unexpected agent')
        },
        dispose: cleaned,
        memory: { async deleteThread() {} },
      }),
    })
    const first = await fixture.runtime.repository.createProject()
    const second = await fixture.runtime.repository.createProject()
    const releaseSecond = deferred()
    const secondEntered = deferred()
    const originalGetProject = fixture.runtime.repository.getProject
    fixture.runtime.repository.getProject = async (id) => {
      if (id === first.id) throw new Error('lookup failed')
      secondEntered.resolve()
      await releaseSecond.promise
      return originalGetProject(id)
    }
    let disposal: Promise<void> | undefined
    try {
      const failed = fixture.runtime.agentRunner.start({
        baseUrl: 'http://fixture.invalid',
        projectId: first.id,
        prompt: 'fail',
        textModel: 'fake/model',
      })
      const pending = fixture.runtime.agentRunner.start({
        baseUrl: 'http://fixture.invalid',
        projectId: second.id,
        prompt: 'wait',
        textModel: 'fake/model',
      })
      await secondEntered.promise
      disposal = fixture.runtime.dispose()
      await expect(failed).rejects.toThrow('lookup failed')
      await Promise.resolve()
      expect(cleaned).not.toHaveBeenCalled()
      releaseSecond.resolve()
      await expect(pending).rejects.toThrow('disposed')
      await expect(disposal).rejects.toThrow('Server runtime disposal failed')
      expect(cleaned).toHaveBeenCalledOnce()
    } finally {
      releaseSecond.resolve()
      await (disposal ?? fixture.runtime.dispose()).catch(() => {})
      await rm(fixture.root, { force: true, recursive: true })
    }
  })

  it('rejects relative filesystem roots', () => {
    expect(() => createProjectFileSystem('relative')).toThrow('absolute path')
  })

  it('disposes the repository when SDK construction fails', async () => {
    const disposeRepository = vi.fn<() => Promise<void>>(async () => {})
    await expect(
      createRuntimeFixture({
        createAgentSdkRuntime: async ({ repository }) => {
          repository.dispose = disposeRepository
          throw new Error('SDK construction failed')
        },
      }),
    ).rejects.toThrow('SDK construction failed')
    expect(disposeRepository).toHaveBeenCalledOnce()
  })

  it('retains isolated Mastra memory across runtime reconstruction and thread deletion', async () => {
    const root = await mkdtemp(join(tmpdir(), 'server-memory-test-'))
    const memoryUrl = pathToFileURL(join(root, 'memory.db')).href
    const prompts: unknown[] = []
    const guardedFetch = globalThis.fetch
    let networkCalls = 0
    globalThis.fetch = async () => {
      networkCalls += 1
      throw new Error('unexpected network')
    }
    const text = `<observations>
The user prefers amber.
</observations>
<current-task>Remember preferences</current-task>
<suggested-response>Amber.</suggested-response>`
    const usage = { inputTokens: 5, outputTokens: 4, totalTokens: 9 }
    const model = {
      async doGenerate(options: { prompt: unknown }) {
        prompts.push(options.prompt)
        return {
          content: [{ text, type: 'text' }],
          finishReason: 'stop',
          usage,
          warnings: [],
        }
      },
      async doStream(options: { prompt: unknown }) {
        prompts.push(options.prompt)
        return {
          stream: new ReadableStream({
            start(controller) {
              for (const chunk of [
                { type: 'stream-start', warnings: [] },
                { id: 'text', type: 'text-start' },
                { delta: text, id: 'text', type: 'text-delta' },
                { id: 'text', type: 'text-end' },
                { finishReason: 'stop', type: 'finish', usage },
              ]) {
                controller.enqueue(chunk)
              }
              controller.close()
            },
          }),
        }
      },
      modelId: 'deterministic',
      provider: 'fixture',
      specificationVersion: 'v2',
      supportedUrls: {},
    }
    let mastra: Mastra | undefined
    let store: LibSQLStore | undefined

    async function construct() {
      store = new LibSQLStore({ id: 'test-storage', url: memoryUrl })
      await store.init()
      const memory = createLandingMemory({
        options: {
          observationalMemory: {
            model: model as never,
            observation: { bufferTokens: false, observeAttachments: false },
          },
        },
        storage: store,
      })
      const agent = new Agent({
        id: 'fixture-agent',
        instructions: 'Remember user preferences.',
        memory,
        model: model as never,
        name: 'Fixture',
      })
      mastra = new Mastra({
        agents: { fixture: agent },
        logger: false,
        storage: store,
      })
      return { agent, memory }
    }

    try {
      let { agent, memory } = await construct()
      await agent.generate('Remember my preferred color is amber.', {
        memory: { resource: 'project-a', thread: 'project-a' },
      })
      await agent.generate('What color did I choose?', {
        memory: { resource: 'project-a', thread: 'project-a' },
      })
      await agent.generate('Another project.', {
        memory: { resource: 'project-b', thread: 'project-b' },
      })
      const om = await memory.omEngine
      if (!om) throw new Error('Observational memory engine was not created.')
      await om.updateRecordConfig('project-a', 'project-a', {
        observation: { bufferTokens: false, messageTokens: 1 },
      })
      const observation = await om.observe({
        resourceId: 'project-a',
        threadId: 'project-a',
      })
      const observedText = await om.getObservations('project-a', 'project-a')
      expect(JSON.stringify(prompts[1])).toContain('preferred color is amber')
      expect(observation.observed).toBe(true)
      expect(observedText).toBeTruthy()

      await mastra!.shutdown()
      await store!.close()
      ;({ agent, memory } = await construct())
      void agent
      const recalled = await memory.recall({
        perPage: false,
        threadId: 'project-a',
      })
      expect(recalled.messages).toHaveLength(4)
      await memory.deleteThread('project-a')
      await expect(
        memory.getThreadById({ threadId: 'project-b' }),
      ).resolves.toBeTruthy()
      expect(networkCalls).toBe(0)
    } finally {
      globalThis.fetch = guardedFetch
      await mastra?.shutdown()
      await store?.close()
      await rm(root, { force: true, recursive: true })
    }
  })
})
