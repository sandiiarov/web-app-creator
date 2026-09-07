import {
  createOperationScope,
  OperationDrainError,
  type OperationContext,
  type OperationScope,
  type OperationScopeFactory,
  runProviderOperation,
  runStandaloneProviderOperation,
} from '../../providers/operation-scope.ts'
import {
  createProviderTransport,
  type ProviderTransport,
} from '../../providers/transport.ts'

export type ModelCapabilities = ReturnType<typeof createModelCapabilities>

export interface ModelCapabilitiesOptions {
  apiKey: string
  chatApiUrl: string
  createScope?: OperationScopeFactory
  transport?: ProviderTransport
}

export interface ModelCatalogEntry {
  contextLength?: number
  modalities: Set<string>
}

interface OpenRouterModelEntry {
  architecture?: { input_modalities?: string[] }
  context_length?: number
  id?: string
}

interface OpenRouterModelsResponse {
  data?: OpenRouterModelEntry[]
}

export function baseModelId(modelId: string): string {
  const colon = modelId.indexOf(':')
  return colon === -1 ? modelId : modelId.slice(0, colon)
}

/** Create an isolated, lazy OpenRouter capability cache. */
export function createModelCapabilities({
  apiKey,
  chatApiUrl,
  createScope = createOperationScope,
  transport = createProviderTransport(),
}: ModelCapabilitiesOptions) {
  let catalogPromise: Promise<Map<string, ModelCatalogEntry>> | undefined

  function loadCatalog(signal?: AbortSignal, operations?: OperationScope) {
    catalogPromise ??= (async () => {
      const request = (operation: OperationContext) =>
        transport.json<OpenRouterModelsResponse>({
          init: {
            headers: { Authorization: `Bearer ${apiKey}` },
            method: 'GET',
          },
          label: 'OpenRouter models',
          maxAttempts: 2,
          operation,
          retry: 'safe',
          url: `${chatApiUrl.replace(/\/+$/, '')}/models`,
        })
      const fetched = operations
        ? await runProviderOperation(operations, 'model-capabilities', request)
        : await runStandaloneProviderOperation(
            createScope,
            'model-capabilities',
            request,
            { operationTimeoutMs: 10_000, signal },
          )
      if (!fetched.ok) throw fetched.error
      return parseModelCatalog(fetched.value)
    })().catch((error: unknown) => {
      catalogPromise = undefined
      throw error
    })
    return catalogPromise
  }

  return {
    async contextWindowTokens(
      modelId: string,
      signal?: AbortSignal,
      operations?: OperationScope,
    ) {
      try {
        return (await loadCatalog(signal, operations)).get(baseModelId(modelId))
          ?.contextLength
      } catch (error) {
        if (error instanceof OperationDrainError) throw error
        return undefined
      }
    },
    async supportsImageInput(
      modelId: string,
      signal?: AbortSignal,
      operations?: OperationScope,
    ) {
      try {
        return (
          (await loadCatalog(signal, operations))
            .get(baseModelId(modelId))
            ?.modalities.has('image') ?? false
        )
      } catch (error) {
        if (error instanceof OperationDrainError) throw error
        return false
      }
    },
  }
}

export function parseModelCatalog(
  json: OpenRouterModelsResponse,
): Map<string, ModelCatalogEntry> {
  const catalog = new Map<string, ModelCatalogEntry>()
  for (const entry of json.data ?? []) {
    if (!entry.id) continue
    catalog.set(entry.id, {
      ...(typeof entry.context_length === 'number' &&
      Number.isFinite(entry.context_length) &&
      entry.context_length > 0
        ? { contextLength: entry.context_length }
        : {}),
      modalities: new Set(
        (entry.architecture?.input_modalities ?? []).map((modality) =>
          modality.toLowerCase(),
        ),
      ),
    })
  }
  return catalog
}
