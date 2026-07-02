/**
 * Baseten cost estimation. Tries the provider-reported cost in `usage.raw`
 * first; falls back to a per-model pricing table × token counts.
 *
 * Prices are per 1M tokens, USD. Update when Baseten publishes confirmed rates.
 */
const PRICING_PER_MILLION: Record<
  string,
  { cachedInput: number; input: number; output: number }
> = {
  'moonshotai/Kimi-K2.7-Code': { cachedInput: 0.15, input: 0.6, output: 2.5 },
  'zai-org/GLM-5.2': { cachedInput: 0.15, input: 0.6, output: 2.2 },
}

/**
 * Firecrawl credits → USD. Metered API rate from firecrawl.dev/pricing
 * (Growth tier, 500k credits/month ≈ $0.001998/credit). Rounded up slightly
 * to avoid under-reporting.
 */
export const FIRECRAWL_CREDIT_USD = 0.002

export function firecrawlCost(creditsUsed: number | undefined): number {
  if (!creditsUsed || creditsUsed <= 0) return 0
  return creditsUsed * FIRECRAWL_CREDIT_USD
}

/**
 * OpenRouter image generation → USD. Flat per-output-image rate from
 * openrouter.ai/bytedance-seed/seedream-4.5 (Seedream 4.5: $0.04/image,
 * regardless of size). Prefers the provider-reported cost when present.
 */
export const OPENROUTER_IMAGE_USD = 0.04

export interface Usage {
  cachedInputTokens?: number
  inputTokens?: number
  outputTokens?: number
  raw?: unknown
  reasoningTokens?: number
  totalTokens?: number
}

export function estimateCost(modelId: string, usage: Usage): number {
  const providerCost = extractProviderCost(usage.raw)
  if (providerCost !== undefined) return providerCost

  const price =
    PRICING_PER_MILLION[modelId] ?? PRICING_PER_MILLION['zai-org/GLM-5.2']!
  const input = usage.inputTokens ?? 0
  const output = usage.outputTokens ?? 0
  const cached = usage.cachedInputTokens ?? 0
  const billableInput = Math.max(0, input - cached)
  return (
    (billableInput * price.input +
      cached * price.cachedInput +
      output * price.output) /
    1_000_000
  )
}

export function imageGenCost(
  imagesGenerated: number,
  providerCost?: number,
): number {
  if (typeof providerCost === 'number' && providerCost > 0) return providerCost
  if (!imagesGenerated || imagesGenerated <= 0) return 0
  return imagesGenerated * OPENROUTER_IMAGE_USD
}

/** Extract a provider-reported cost from the raw usage object if present. */
function extractProviderCost(raw: unknown): number | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const candidates = ['cost', 'estimated_cost', 'total_cost', 'prompt_cost']
  for (const key of candidates) {
    const value = (raw as Record<string, unknown>)[key]
    if (typeof value === 'number' && value > 0) return value
  }
  // OpenRouter-style nested cost
  const nested = (raw as Record<string, unknown>).cost
  if (nested && typeof nested === 'object') {
    const total = (nested as Record<string, unknown>).total
    if (typeof total === 'number' && total > 0) return total
  }
  return undefined
}

/**
 * OpenRouter vision (z-ai/glm-5v-turbo) → USD. Per-1M-token pricing from
 * openrouter.ai/z-ai/glm-5v-turbo: $1.20 input / $4.00 output / $0.24 cache.
 * Prefers the provider-reported `usage.cost` when present.
 */
export const VISION_PRICING = {
  cacheRead: 0.24,
  input: 1.2,
  output: 4,
}

export interface VisionUsage {
  cachedTokens?: number
  completionTokens?: number
  promptTokens?: number
}

export function visionCost(usage: VisionUsage, providerCost?: number): number {
  if (typeof providerCost === 'number' && providerCost > 0) return providerCost
  const prompt = usage.promptTokens ?? 0
  const completion = usage.completionTokens ?? 0
  const cached = usage.cachedTokens ?? 0
  const billablePrompt = Math.max(0, prompt - cached)
  return (
    (billablePrompt * VISION_PRICING.input +
      cached * VISION_PRICING.cacheRead +
      completion * VISION_PRICING.output) /
    1_000_000
  )
}
