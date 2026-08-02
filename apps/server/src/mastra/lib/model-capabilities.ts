import { config } from '../../config.ts'
import { boundedFetch } from './bounded-fetch.ts'

/**
 * OpenRouter model capability detection. The `/models` catalog reports each
 * model's `architecture.input_modalities` (e.g. `['text', 'image']`); we fetch
 * it once per process and cache it so per-run checks are free. Any failure
 * (network, parse, unknown model) resolves to `false` so callers fall back to
 * the separate vision-model OCR path instead of sending images to a model
 * that cannot read them.
 */

interface OpenRouterModelEntry {
  architecture?: {
    input_modalities?: string[]
  }
  id?: string
}

interface OpenRouterModelsResponse {
  data?: OpenRouterModelEntry[]
}

let catalogPromise: Promise<Map<string, Set<string>>> | undefined

/** Strip an OpenRouter variant suffix (`:nitro`, `:free`, …) for catalog lookup. */
export function baseModelId(modelId: string): string {
  const colon = modelId.indexOf(':')
  return colon === -1 ? modelId : modelId.slice(0, colon)
}

/** Parse the `/models` catalog into `model id -> input modalities`. */
export function parseModelCatalog(
  json: OpenRouterModelsResponse,
): Map<string, Set<string>> {
  const catalog = new Map<string, Set<string>>()
  for (const entry of json.data ?? []) {
    if (!entry.id) continue
    catalog.set(
      entry.id,
      new Set(
        (entry.architecture?.input_modalities ?? []).map((modality) =>
          modality.toLowerCase(),
        ),
      ),
    )
  }
  return catalog
}

/** Whether the given chat model accepts image inputs, per the OpenRouter
 *  catalog. Resolves `false` on any failure so vision OCR stays the fallback. */
export async function supportsImageInput(
  modelId: string,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    const catalog = await fetchModelCatalog(signal)
    return catalog.get(baseModelId(modelId))?.has('image') ?? false
  } catch {
    return false
  }
}

function fetchModelCatalog(
  signal?: AbortSignal,
): Promise<Map<string, Set<string>>> {
  catalogPromise ??= (async () => {
    const fetched = await boundedFetch(
      `${config.openrouter.chatApiUrl.replace(/\/+$/, '')}/models`,
      {
        headers: {
          Authorization: `Bearer ${config.openrouter.apiKey}`,
        },
        method: 'GET',
      },
      // Capability detection must never stall a run: short timeout, fewer
      // retries, and the run's abort signal so a user stop cancels promptly.
      { label: 'OpenRouter models', maxAttempts: 2, signal, timeoutMs: 10_000 },
    )
    if (!fetched.ok) {
      throw new Error(fetched.reason)
    }
    if (!fetched.response.ok) {
      throw new Error(`OpenRouter models error (${fetched.response.status})`)
    }
    return parseModelCatalog(
      (await fetched.response.json()) as OpenRouterModelsResponse,
    )
  })().catch((error: unknown) => {
    // Do not cache failures: the next run retries the catalog fetch.
    catalogPromise = undefined
    throw error
  })
  return catalogPromise
}
