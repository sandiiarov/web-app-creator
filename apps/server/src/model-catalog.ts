import { boundedFetch } from './mastra/lib/bounded-fetch.ts'

/**
 * Slim model-pricing catalog for the UI model picker. Fetches OpenRouter's
 * public `/models` catalog, keeps only the per-model fields the picker
 * displays (per-1M-token input/output/cache-read USD prices + per-image /
 * per-1M-image-token prices for image models), and caches the result
 * in-process for a short TTL. A failed refresh serves the last good
 * snapshot (stale-on-error, mirroring the upstream CDN semantics); with no
 * snapshot at all the error propagates so the route can report 502 and the
 * client falls back to its bundled static pricing.
 *
 * Image-generation-only models (Seedream, GPT Image, Grok Imagine) are
 * absent from the chat `/models` catalog — their prices come from the
 * images API (`/images/models/:id/endpoints`) via `getImageModelPricing`,
 * cached per id with the same TTL and failure-skip semantics so one bad
 * upstream response never 502s the whole route.
 */

const CATALOG_URL = 'https://openrouter.ai/api/v1/models'
const IMAGE_ENDPOINTS_URL = (id: string) =>
  `https://openrouter.ai/api/v1/images/models/${id}/endpoints`
/** Matches the upstream `cache-control: max-age=300`. */
const CATALOG_TTL_MS = 5 * 60 * 1000

export type ModelPricingCatalog = Record<string, ModelPricingEntry>

export type ModelPricingEntry = {
  cacheRead?: number
  /** USD per generated image (image models priced per image). */
  image?: number
  /** USD per 1M image-output tokens (image models priced per image token). */
  imageOutput?: number
  input: number
  output: number
}

interface ImageEndpointPriceItem {
  billable?: string
  cost_usd?: number
  unit?: string
  variant?: string
}

interface ImageModelEndpointsResponse {
  endpoints?: Array<{
    pricing?: ImageEndpointPriceItem[]
  }>
}

/** Per-id cache for images-endpoints pricing; `null` = known absent. */
const imagePricingCache = new Map<
  string,
  { entry: ImageModelPricing | null; fetchedAt: number }
>()

export type ImageModelPricing = {
  image?: number
  imageOutput?: number
}

interface OpenRouterModelEntry {
  id?: string
  pricing?: {
    completion?: string
    image_output?: string
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
 * Return images-API pricing for the given ids (image-generation-only models
 * absent from the chat catalog). Each id is fetched + cached independently
 * with the shared TTL; a failed id keeps its stale entry or is skipped, so
 * enrichment never breaks the route. Unknown ids are negative-cached.
 */
export async function getImageModelPricing(
  ids: readonly string[],
  signal?: AbortSignal,
): Promise<Record<string, ImageModelPricing>> {
  const now = Date.now()
  const fresh = new Set<string>()
  const stale = new Set<string>()
  for (const id of ids) {
    const cached = imagePricingCache.get(id)
    if (cached && now - cached.fetchedAt < CATALOG_TTL_MS) fresh.add(id)
    else stale.add(id)
  }

  await Promise.all(
    [...stale].map(async (id) => {
      try {
        const fetched = await boundedFetch(
          IMAGE_ENDPOINTS_URL(id),
          {},
          {
            label: 'OpenRouter image model pricing',
            signal,
            timeoutMs: 15_000,
          },
        )
        if (!fetched.ok) throw new Error(fetched.reason)
        if (!fetched.response.ok) {
          throw new Error(
            `OpenRouter image endpoints returned ${fetched.response.status}`,
          )
        }
        const entry = parseImageEndpointsPricing(
          (await fetched.response.json()) as ImageModelEndpointsResponse,
        )
        imagePricingCache.set(id, { entry, fetchedAt: Date.now() })
        fresh.add(id)
      } catch {
        // Keep the stale entry (or absence) for this id.
        if (imagePricingCache.has(id)) fresh.add(id)
      }
    }),
  )

  const result: Record<string, ImageModelPricing> = {}
  for (const id of fresh) {
    const entry = imagePricingCache.get(id)?.entry
    if (entry) result[id] = entry
  }
  return result
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
/**
 * Parse an images-API endpoints response into the picker's image prices:
 * `image` (USD per output image, first per-image variant) and/or
 * `imageOutput` (USD per 1M image-output tokens). Returns `null` when the
 * model has no image-output pricing at all.
 */
export function parseImageEndpointsPricing(
  json: ImageModelEndpointsResponse,
): ImageModelPricing | null {
  const items = (json.endpoints ?? []).flatMap(
    (endpoint) => endpoint.pricing ?? [],
  )
  const perImage = items.find(
    (item) => item.billable === 'output_image' && item.unit === 'image',
  )
  const perToken = items.find(
    (item) => item.billable === 'output_image' && item.unit === 'token',
  )
  const image = perImage?.cost_usd
  const imageOutput =
    perToken?.cost_usd == null ? undefined : roundPrice(perToken.cost_usd)
  const pricing: ImageModelPricing = {
    ...(image != null && Number.isFinite(image) ? { image } : {}),
    ...(imageOutput != null && Number.isFinite(imageOutput)
      ? { imageOutput }
      : {}),
  }
  return pricing.image != null || pricing.imageOutput != null ? pricing : null
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
    const imageOutput =
      pricing.image_output == null
        ? undefined
        : roundPrice(Number(pricing.image_output))
    catalog[id] = {
      ...(cacheRead != null && Number.isFinite(cacheRead) ? { cacheRead } : {}),
      ...(imageOutput != null && Number.isFinite(imageOutput)
        ? { imageOutput }
        : {}),
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
  imagePricingCache.clear()
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
