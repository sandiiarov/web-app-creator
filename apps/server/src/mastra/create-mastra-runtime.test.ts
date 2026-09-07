import { describe, expect, it, vi } from 'vitest'

import { createLandingMemory } from './agents/landing-page-agent.ts'
import {
  closeMastraResources,
  deleteLandingMemoryProject,
} from './create-mastra-runtime.ts'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

describe('closeMastraResources', () => {
  it('flushes observability before Mastra shutdown and store closes', async () => {
    const observationFlushed = deferred()
    const mastraStopped = deferred()
    const calls: string[] = []
    const closing = closeMastraResources({
      mastra: {
        async shutdown() {
          calls.push('mastra')
          await mastraStopped.promise
        },
      },
      memoryStore: {
        async close() {
          calls.push('memory-store')
        },
      },
      observability: {
        async shutdown() {
          calls.push('observability')
          await observationFlushed.promise
        },
      },
      observabilityStore: {
        async close() {
          calls.push('observability-store')
        },
      },
    })

    await Promise.resolve()
    expect(calls).toEqual(['observability'])
    observationFlushed.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(calls).toEqual(['observability', 'mastra'])
    mastraStopped.resolve()

    await expect(closing).resolves.toEqual([])
    expect(calls.slice(2).sort()).toEqual([
      'memory-store',
      'observability-store',
    ])
  })

  it('attempts every later cleanup stage after failures', async () => {
    const calls: string[] = []
    const failing = (name: string) =>
      vi.fn<() => Promise<never>>(async () => {
        calls.push(name)
        throw new Error(name)
      })

    const errors = await closeMastraResources({
      mastra: { shutdown: failing('mastra') },
      memoryStore: { close: failing('memory-store') },
      observability: { shutdown: failing('observability') },
      observabilityStore: { close: failing('observability-store') },
    })

    expect(calls.slice(0, 2)).toEqual(['observability', 'mastra'])
    expect(calls.slice(2).sort()).toEqual([
      'memory-store',
      'observability-store',
    ])
    expect(errors).toHaveLength(4)
  })
})

describe('landing memory lifecycle', () => {
  it('keeps Observational Memory buffering disabled under per-run thresholds', () => {
    const memory = createLandingMemory()
    const merged = memory.getMergedThreadConfig({
      observationalMemory: {
        observation: { messageTokens: 1_000 },
      },
    })

    expect(merged.observationalMemory).not.toBe(false)
    const observational =
      typeof merged.observationalMemory === 'object'
        ? merged.observationalMemory
        : undefined
    expect(observational?.observation).toMatchObject({
      bufferTokens: false,
      messageTokens: 1_000,
      observeAttachments: false,
    })
  })

  it('retries OM cleanup after the thread row was already deleted', async () => {
    let clearAttempts = 0
    const memory = {
      deleteThread: vi.fn<(threadId: string) => Promise<void>>(async () => {}),
      getThreadById: vi.fn<(options: { threadId: string }) => Promise<null>>(
        async () => null,
      ),
      omEngine: Promise.resolve({
        async clear() {
          clearAttempts += 1
          if (clearAttempts === 1) throw new Error('OM unavailable')
        },
        async getRecord() {
          return null
        },
      }),
    }

    await expect(
      deleteLandingMemoryProject(memory, 'project-a'),
    ).rejects.toThrow('OM unavailable')
    await expect(
      deleteLandingMemoryProject(memory, 'project-a'),
    ).resolves.toBeUndefined()
    expect(memory.deleteThread).toHaveBeenCalledTimes(2)
    expect(clearAttempts).toBe(2)
  })
})
