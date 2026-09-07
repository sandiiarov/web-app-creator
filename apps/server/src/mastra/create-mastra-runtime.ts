import { Agent } from '@mastra/core/agent'
import { Mastra } from '@mastra/core/mastra'
import { MastraCompositeStore } from '@mastra/core/storage'
import { DuckDBStore } from '@mastra/duckdb'
import { LibSQLStore } from '@mastra/libsql'
import { PinoLogger } from '@mastra/loggers'
import {
  MastraStorageExporter,
  Observability,
  SensitiveDataFilter,
} from '@mastra/observability'

import type { ProviderTransport } from '../providers/transport.ts'
import {
  createLandingMemory,
  createLandingPageAgent,
  createLandingPageAgentConfig,
  createLandingStudioStore,
} from './agents/landing-page-agent.ts'
import type { ImageStore } from './lib/image-store.ts'
import type { ProjectRepository } from './lib/project-store.ts'
import type { LandingAgentFactory } from './route.ts'
import { createLandingSkillsWorkspace } from './workspace.ts'

export interface CreateMastraRuntimeOptions {
  imageStore: ImageStore
  memoryStoreUrl: string
  observabilityStorePath: string
  repository: ProjectRepository
  transport: ProviderTransport
}

export type MastraRuntime = Awaited<ReturnType<typeof createMastraRuntime>>

type CloseableResource = { close(): Promise<void> }
interface LandingMemoryDeletionPort {
  deleteThread(threadId: string): Promise<void>
  getThreadById(input: { threadId: string }): Promise<unknown>
  omEngine: Promise<null | {
    clear(threadId: string, resourceId?: string): Promise<void>
    getRecord(threadId: string, resourceId?: string): Promise<unknown>
  }>
}

type ShutdownResource = { shutdown(): Promise<void> }

/** Flush telemetry before Mastra can close its storage, then close both stores. */
export async function closeMastraResources({
  mastra,
  memoryStore,
  observability,
  observabilityStore,
}: {
  mastra?: ShutdownResource
  memoryStore: CloseableResource
  observability?: ShutdownResource
  observabilityStore: CloseableResource
}): Promise<unknown[]> {
  const errors: unknown[] = []
  if (observability) {
    try {
      await observability.shutdown()
    } catch (error) {
      errors.push(error)
    }
  }
  if (mastra) {
    try {
      await mastra.shutdown()
    } catch (error) {
      errors.push(error)
    }
  }
  const closeResults = await Promise.allSettled([
    memoryStore.close(),
    observabilityStore.close(),
  ])
  errors.push(
    ...closeResults
      .filter((result) => result.status === 'rejected')
      .map((result) => result.reason),
  )
  return errors
}

/** Explicitly construct the SDK resources owned by one server runtime. */
export async function createMastraRuntime({
  imageStore,
  memoryStoreUrl,
  observabilityStorePath,
  repository,
  transport,
}: CreateMastraRuntimeOptions) {
  const memoryStore = new LibSQLStore({
    id: 'landing-page-agent',
    url: memoryStoreUrl,
  })
  const observabilityStore = new DuckDBStore({
    path: observabilityStorePath,
  })
  let observability: Observability | undefined
  let mastra: Mastra | undefined

  async function closeResources(): Promise<unknown[]> {
    return closeMastraResources({
      mastra,
      memoryStore,
      observability,
      observabilityStore,
    })
  }

  try {
    await memoryStore.init()
    const memory = createLandingMemory({ storage: memoryStore })
    observability = new Observability({
      configs: {
        default: {
          exporters: [new MastraStorageExporter()],
          serviceName: 'landing-page-agent',
          spanOutputProcessors: [new SensitiveDataFilter()],
        },
      },
    })
    mastra = new Mastra({
      agents: {
        landingPageAgent: new Agent(
          createLandingPageAgentConfig(
            createLandingStudioStore(),
            memory,
            'http://localhost:3001',
            { imageStore, repository, transport },
          ),
        ),
      },
      logger: new PinoLogger({ level: 'info', name: 'landing-page-agent' }),
      observability,
      storage: new MastraCompositeStore({
        default: memoryStore,
        domains: { observability: observabilityStore.observability },
        id: 'landing-page-agent',
      }),
      workspace: createLandingSkillsWorkspace(),
    })

    const createAgent: LandingAgentFactory = (
      store,
      baseUrl,
      textModel,
      capture,
      options,
    ) =>
      createLandingPageAgent(
        store,
        mastra!,
        memory,
        baseUrl,
        { ...options, imageStore, repository },
        // The runtime transport owns every tool response body and retry.
        // Per-run operation scope arrives through `options`.
        textModel,
        capture,
      )

    async function deleteProjectMemory(projectId: string): Promise<void> {
      await deleteLandingMemoryProject(memory, projectId)
    }

    let disposal: Promise<void> | undefined
    return {
      createAgent,
      deleteProjectMemory,
      dispose() {
        disposal ??= (async () => {
          const errors = await closeResources()
          if (errors.length > 0) {
            throw new AggregateError(errors, 'Mastra runtime disposal failed.')
          }
        })()
        return disposal
      },
      mastra,
      memory,
    }
  } catch (error) {
    const cleanupErrors = await closeResources()
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [error, ...cleanupErrors],
        'Mastra runtime construction and cleanup failed.',
      )
    }
    throw error
  }
}

export async function deleteLandingMemoryProject(
  memory: LandingMemoryDeletionPort,
  projectId: string,
): Promise<void> {
  const engine = await memory.omEngine
  await memory.deleteThread(projectId)
  if (engine) {
    await engine.clear(projectId, projectId)
    if (await engine.getRecord(projectId, projectId)) {
      throw new Error('Observational Memory cleanup did not complete.')
    }
  }
  if (await memory.getThreadById({ threadId: projectId })) {
    throw new Error('Memory thread cleanup did not complete.')
  }
}
