import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { config } from './config.ts'
import { createMastraRuntime } from './mastra/create-mastra-runtime.ts'
import { ocrImageInputs } from './mastra/lib/image-ocr.ts'
import { createModelCapabilities } from './mastra/lib/model-capabilities.ts'
import { createProjectFileSystem } from './mastra/lib/project-filesystem.ts'
import { captureProjectSelectors } from './mastra/lib/project-screenshot.ts'
import { createModelCatalog } from './model-catalog.ts'
import { createProviderTransport } from './providers/transport.ts'
import { createServerRuntime } from './runtime.ts'

const SERVER_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Build production dependencies without listening or running recovery. */
export function createProductionRuntime() {
  const transport = createProviderTransport()
  return createServerRuntime({
    capabilities: createModelCapabilities({
      apiKey: config.openrouter.apiKey ?? '',
      chatApiUrl: config.openrouter.chatApiUrl,
      transport,
    }),
    captureProjectSelectors,
    config,
    createAgentSdkRuntime: ({
      imageStore,
      memoryStoreUrl,
      observabilityStorePath,
      repository,
      transport,
    }) =>
      createMastraRuntime({
        imageStore,
        memoryStoreUrl,
        observabilityStorePath,
        repository,
        transport,
      }),
    dataDir: resolve(SERVER_DIR, '.data'),
    fileSystem: createProjectFileSystem(resolve(SERVER_DIR, '.data')),
    logger: (projectId, error) => {
      console.error(
        `[project-store] append-only log write failed (project=${projectId}):`,
        error,
      )
    },
    memoryStoreUrl: pathToFileURL(resolve('mastra.db')).href,
    modelCatalog: createModelCatalog({ transport }),
    observabilityStorePath: resolve('mastra.duckdb'),
    ocrImageInputs,
    transport,
  })
}
