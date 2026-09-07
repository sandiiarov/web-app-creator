import { isAbsolute } from 'node:path'

import { createProjectService } from './application/project-service.ts'
import { ProjectServiceUnsettledError } from './application/project-service.ts'
import { RunCoordinatorUnsettledError } from './application/run-coordinator.ts'
import type { config as productionConfig } from './config.ts'
import { createImageStore } from './mastra/lib/image-store.ts'
import type { ModelCapabilities } from './mastra/lib/model-capabilities.ts'
import type { ProjectFileSystem } from './mastra/lib/project-filesystem.ts'
import type {
  CapturedProjectSelector,
  CaptureProjectSelectorsInput,
  ProjectScreenshotDependencies,
} from './mastra/lib/project-screenshot.ts'
import {
  createProjectRepository,
  type ProjectWriteFailureLogger,
} from './mastra/lib/project-store.ts'
import { createRunBus } from './mastra/lib/run-bus.ts'
import {
  createLandingAgentRunner,
  type LandingAgentFactory,
  type LandingAgentRunner,
} from './mastra/route.ts'
import type { ModelPricingCatalog } from './model-catalog.ts'
import type { OperationScopeFactory } from './providers/operation-scope.ts'
import type { ProviderTransport } from './providers/transport.ts'

export interface AgentSdkRuntime {
  createAgent: LandingAgentFactory
  deleteProjectMemory?(projectId: string): Promise<void>
  dispose(): Promise<void>
  mastra?: unknown
  memory: { deleteThread(threadId: string): Promise<unknown> }
}

export interface CreateServerRuntimeOptions {
  capabilities: ModelCapabilities
  captureProjectSelectors: (
    input: CaptureProjectSelectorsInput,
    dependencies: ProjectScreenshotDependencies,
  ) => Promise<CapturedProjectSelector[]>
  config: typeof productionConfig
  createAgentSdkRuntime(input: {
    imageStore: ReturnType<typeof createImageStore>
    memoryStoreUrl: string
    observabilityStorePath: string
    repository: ReturnType<typeof createProjectRepository>
    transport: ProviderTransport
  }): Promise<AgentSdkRuntime>
  createOperationScope?: OperationScopeFactory
  dataDir: string
  fileSystem: ProjectFileSystem
  logger: ProjectWriteFailureLogger
  memoryStoreUrl: string
  modelCatalog: RuntimeModelCatalog
  observabilityStorePath: string
  ocrImageInputs: Parameters<
    typeof createLandingAgentRunner
  >[0]['ocrImageInputs']
  transport: ProviderTransport
}

export interface RuntimeModelCatalog {
  filter(
    catalog: ModelPricingCatalog,
    ids: readonly string[],
  ): ModelPricingCatalog
  get(signal?: AbortSignal): Promise<ModelPricingCatalog>
  getImages(
    ids: readonly string[],
    signal?: AbortSignal,
  ): Promise<Record<string, { image?: number; imageOutput?: number }>>
}

export type ServerRuntime = Awaited<ReturnType<typeof createServerRuntime>>

export async function createServerRuntime(options: CreateServerRuntimeOptions) {
  if (!isAbsolute(options.dataDir)) {
    throw new Error('Server runtime dataDir must be an absolute path.')
  }
  const imageStore = createImageStore()
  const runBus = createRunBus()
  const repository = createProjectRepository({
    dataDir: options.dataDir,
    fileSystem: options.fileSystem,
    imageStore,
    logger: options.logger,
    runBus,
  })

  let sdk: AgentSdkRuntime
  try {
    sdk = await options.createAgentSdkRuntime({
      imageStore,
      memoryStoreUrl: options.memoryStoreUrl,
      observabilityStorePath: options.observabilityStorePath,
      repository,
      transport: options.transport,
    })
  } catch (error) {
    runBus.dispose()
    imageStore.clear()
    const cleanup = await Promise.allSettled([repository.dispose()])
    const cleanupErrors = cleanup.flatMap((result) =>
      result.status === 'rejected' ? [result.reason] : [],
    )
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [error, ...cleanupErrors],
        'Server runtime construction and cleanup failed.',
      )
    }
    throw error
  }

  const agentRunner: LandingAgentRunner = createLandingAgentRunner({
    bus: runBus,
    capabilities: options.capabilities,
    captureProjectSelectors: options.captureProjectSelectors,
    createAgent: sdk.createAgent,
    createOperationScope: options.createOperationScope,
    ocrImageInputs: options.ocrImageInputs,
    repository,
    runtimeConfig: options.config,
    transport: options.transport,
  })
  const projectService = createProjectService({
    coordinator: agentRunner,
    drainGraceMs: options.config.providerExecution.drainGraceMs,
    memory: {
      deleteProjectMemory: sdk.deleteProjectMemory
        ? (projectId) => sdk.deleteProjectMemory!(projectId)
        : (projectId) => sdk.memory.deleteThread(projectId).then(() => {}),
    },
    repository,
  })

  let disposal: Promise<void> | undefined
  return {
    agentRunner,
    config: options.config,
    dispose() {
      disposal ??= disposeRuntime(
        agentRunner,
        imageStore,
        projectService,
        repository,
        runBus,
        sdk,
      ).catch((error: unknown) => {
        if (containsUnsettledRun(error)) disposal = undefined
        throw error
      })
      return disposal
    },
    imageStore,
    mastra: sdk.mastra,
    memory: sdk.memory,
    modelCatalog: options.modelCatalog,
    projectService,
    repository,
    runBus,
  }
}

function containsUnsettledRun(error: unknown): boolean {
  return (
    error instanceof RunCoordinatorUnsettledError ||
    error instanceof ProjectServiceUnsettledError ||
    (error instanceof AggregateError &&
      error.errors.some((nested) => containsUnsettledRun(nested)))
  )
}

async function disposeRuntime(
  agentRunner: LandingAgentRunner,
  imageStore: ReturnType<typeof createImageStore>,
  projectService: ReturnType<typeof createProjectService>,
  repository: ReturnType<typeof createProjectRepository>,
  runBus: ReturnType<typeof createRunBus>,
  sdk: AgentSdkRuntime,
): Promise<void> {
  const errors: unknown[] = []
  projectService.close()
  agentRunner.close()
  try {
    await agentRunner.dispose()
  } catch (error) {
    if (containsUnsettledRun(error)) {
      throw new AggregateError([error], 'Server runtime disposal failed.')
    }
    errors.push(error)
  }
  try {
    await projectService.dispose()
  } catch (error) {
    if (containsUnsettledRun(error)) {
      throw new AggregateError([error], 'Server runtime disposal failed.')
    }
    errors.push(error)
  }
  runBus.dispose()
  const results = await Promise.allSettled([
    repository.dispose(),
    sdk.dispose(),
  ])
  imageStore.clear()
  errors.push(
    ...results
      .filter((result) => result.status === 'rejected')
      .map((result) => result.reason),
  )
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Server runtime disposal failed.')
  }
}
