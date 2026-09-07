import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { createConfigFromEnv } from '../config-env.ts'
import { createProjectFileSystem } from '../mastra/lib/project-filesystem.ts'
import type { LandingAgentFactory } from '../mastra/route.ts'
import { createProviderTransport } from '../providers/transport.ts'
import {
  createServerRuntime,
  type CreateServerRuntimeOptions,
} from '../runtime.ts'

const unexpectedAgent: LandingAgentFactory = () => {
  throw new Error('Unexpected agent invocation in isolated runtime fixture.')
}

export type RuntimeFixture = Awaited<ReturnType<typeof createRuntimeFixture>>

type RuntimeFixtureOverrides = Partial<
  Pick<
    CreateServerRuntimeOptions,
    | 'capabilities'
    | 'captureProjectSelectors'
    | 'config'
    | 'createAgentSdkRuntime'
    | 'modelCatalog'
    | 'ocrImageInputs'
  >
>

export async function createRuntimeFixture(
  overrides: RuntimeFixtureOverrides = {},
  location?: { removeRoot?: boolean; root: string },
) {
  const root =
    location?.root ?? (await mkdtemp(join(tmpdir(), 'web-app-server-test-')))
  const dataDir = resolve(root, 'data')
  const fileSystem = createProjectFileSystem(dataDir)
  const memoryStoreUrl = pathToFileURL(resolve(root, 'memory.db')).href
  const observabilityStorePath = resolve(root, 'observability.duckdb')
  let runtime
  const transport = createProviderTransport()
  try {
    runtime = await createServerRuntime({
      capabilities: overrides.capabilities ?? {
        async contextWindowTokens() {
          return undefined
        },
        async supportsImageInput() {
          return false
        },
      },
      captureProjectSelectors:
        overrides.captureProjectSelectors ??
        (async () => {
          throw new Error('Unexpected screenshot capture in runtime fixture.')
        }),
      config: overrides.config ?? createConfigFromEnv(process.env),
      createAgentSdkRuntime:
        overrides.createAgentSdkRuntime ??
        (async () => ({
          createAgent: unexpectedAgent,
          async deleteProjectMemory() {},
          async dispose() {},
          memory: { async deleteThread() {} },
        })),
      dataDir,
      fileSystem,
      logger() {},
      memoryStoreUrl,
      modelCatalog: overrides.modelCatalog ?? {
        filter(catalog, ids) {
          return Object.fromEntries(
            ids.flatMap((id) => (catalog[id] ? [[id, catalog[id]]] : [])),
          )
        },
        async get() {
          return {}
        },
        async getImages() {
          return {}
        },
      },
      observabilityStorePath,
      ocrImageInputs:
        overrides.ocrImageInputs ??
        (async () => {
          throw new Error('Unexpected OCR invocation in runtime fixture.')
        }),
      transport,
    })
  } catch (error) {
    await rm(root, { force: true, recursive: true })
    throw error
  }

  let cleanup: Promise<void> | undefined
  return {
    dataDir,
    dispose() {
      cleanup ??= runtime
        .dispose()
        .finally(() =>
          location?.removeRoot === false
            ? undefined
            : rm(root, { force: true, recursive: true }),
        )
      return cleanup
    },
    fileSystem,
    memoryStoreUrl,
    observabilityStorePath,
    root,
    runtime,
  }
}
