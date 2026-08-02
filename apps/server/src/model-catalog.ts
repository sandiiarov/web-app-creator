import { boundedFetch } from './mastra/lib/bounded-fetch.ts'

/**
 * Slim model-pricing catalog for the UI model picker. Fetches OpenRouter's
 * public `/models` catalog, keeps only the per-model fields the picker
 * displays (per-1M-token input/output/cache-read USD prices), and caches the
 * result in-process for a short TTL. A failed refresh serves the last good
 * snapshot (stale-on-error, mirroring the upstream CDN semantics); with no
 * snapshot at all the error propagates so the route can report 502 and the
 * client falls back to its bundled static pricing.
 */

const CATALOG_URL = 'https://openrouter.ai/api/v1/models'
/** Matches the upstream `cache-control: max-age=300`. */
const CATALOG_TTL_MS = 5 * 60 * 1000

export type ModelPricingCatalog = Record<string, ModelPricingEntry>

export type ModelPricingEntry = {
  cacheRead?: number
  input: number
  output: number
}

interface OpenRouterModelEntry {
  id?: string
  pricing?: {
    completion?: string
    input_cache_read?: string
    prompt?: string
  }
}

interface OpenRouterModelsResponse {
  data?: OpenRouterModelEntry[]
}

let snapshot: undefined | { data: ModelPricingCatalog; fetchedAt: number }
let inflight: Promise<ModelPricingCatalog> | undefined

/**
 * Return the catalog subset for the given model ids (the app's supported
 * models, as declared by the client's picker options). Unknown ids are
 * ignored; a model absent from the upstream catalog simply does not appear.
 */
export function filterModelPricing(
  catalog: ModelPricingCatalog,
  ids: readonly string[],
): ModelPricingCatalog {
  const filtered: ModelPricingCatalog = {}
  for (const id of ids) {
    const entry = catalog[id]
    if (entry) filtered[id] = entry
  }
  return filtered
}

/**
 * Return the slim pricing catalog, served from the in-process TTL cache when
 * fresh. Concurrent callers share one upstream refresh.
 */
export async function getModelPricing(
  signal?: AbortSignal,
): Promise<ModelPricingCatalog> {
  if (snapshot && Date.now() - snapshot.fetchedAt < CATALOG_TTL_MS) {
    return snapshot.data
  }
  inflight ??= refresh(signal).finally(() => {
    inflight = undefined
  })
  return inflight
}

/** Parse the `/models` catalog into per-1M-token USD prices keyed by model id. */
export function parseModelPricing(
  json: OpenRouterModelsResponse,
): ModelPricingCatalog {
  const catalog: ModelPricingCatalog = {}
  for (const entry of json.data ?? []) {
    const { id, pricing } = entry
    if (!id || !pricing?.prompt || !pricing?.completion) continue
    const input = roundPrice(Number(pricing.prompt))
    const output = roundPrice(Number(pricing.completion))
    if (!Number.isFinite(input) || !Number.isFinite(output)) continue
    const cacheRead =
      pricing.input_cache_read == null
        ? undefined
        : roundPrice(Number(pricing.input_cache_read))
    catalog[id] = {
      ...(cacheRead != null && Number.isFinite(cacheRead) ? { cacheRead } : {}),
      input,
      output,
    }
  }
  return catalog
}

/** Test-only hook: clear the in-process cache. */
export function resetModelPricingCache() {
  snapshot = undefined
  inflight = undefined
}

async function refresh(signal?: AbortSignal): Promise<ModelPricingCatalog> {
  try {
    const result = await boundedFetch(
      CATALOG_URL,
      {},
      { label: 'OpenRouter model catalog', signal, timeoutMs: 15_000 },
    )
    if (!result.ok) throw new Error(result.reason)
    if (!result.response.ok) {
      throw new Error(
        `OpenRouter model catalog returned ${result.response.status}`,
      )
    }
    const json = (await result.response.json()) as OpenRouterModelsResponse
    const data = parseModelPricing(json)
    snapshot = { data, fetchedAt: Date.now() }
    return data
  } catch (error) {
    if (snapshot) return snapshot.data
    throw error
  }
}

/** Per-token USD number → per-1M USD, avoiding float artifacts. */
function roundPrice(perToken: number) {
  return Number((perToken * 1e6).toFixed(6))
}
