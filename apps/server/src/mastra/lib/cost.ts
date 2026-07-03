/**
 * Cost accounting. Prefer provider/tool-reported costs when present; otherwise
 * calculate fallback costs from token/image/credit usage using the rates below.
 * Baseten token prices come from `/v1/models` metadata and the Model APIs UI.
 */

interface TokenPricing {
  cachedInput: number
  input: number
  output: number
}

const BASETEN_TOKEN_PRICING_USD: Record<string, TokenPricing> = {
  'moonshotai/Kimi-K2.7-Code': {
    cachedInput: perMillion(0.16),
    input: perMillion(0.95),
    output: perMillion(4),
  },
  'zai-org/GLM-5.2': {
    cachedInput: perMillion(0.26),
    input: perMillion(1.4),
    output: perMillion(4.4),
  },
}

const DEFAULT_BASETEN_MODEL_ID = 'zai-org/GLM-5.2'
const BASETEN_VISION_MODEL_ID = 'moonshotai/Kimi-K2.7-Code'

/**
 * Firecrawl credits → USD. Metered API rate from firecrawl.dev/pricing
 * (Growth tier, 500k credits/month ≈ $0.001998/credit). Rounded up slightly.
 */
const FIRECRAWL_CREDIT_USD = 0.002

/** OpenRouter Seedream 4.5 image generation fallback price. */
const OPENROUTER_IMAGE_USD = 0.04

export interface Usage {
  cachedInputTokens?: number
  inputTokens?: number
  outputTokens?: number
  raw?: unknown
  reasoningTokens?: number
  totalTokens?: number
}

export interface VisionUsage {
  cachedTokens?: number
  completionTokens?: number
  promptTokens?: number
}

export function calculateLlmCost(modelId: string, usage: Usage): number {
  const providerCost = providerReportedCost(usage.raw)
  if (providerCost > 0) return providerCost
  return tokenUsageCost(modelId, usage)
}

export function firecrawlCost(creditsUsed: number | undefined): number {
  if (!creditsUsed || creditsUsed <= 0) return 0
  return creditsUsed * FIRECRAWL_CREDIT_USD
}

export function imageGenCost(
  imagesGenerated: number,
  providerCost?: number,
): number {
  if (typeof providerCost === 'number' && providerCost > 0) return providerCost
  if (!imagesGenerated || imagesGenerated <= 0) return 0
  return imagesGenerated * OPENROUTER_IMAGE_USD
}

export function providerReportedCost(...sources: unknown[]): number {
  for (let index = sources.length - 1; index >= 0; index -= 1) {
    const source = sources[index]
    const cost =
      typeof source === 'number' || typeof source === 'string'
        ? numberFrom(source)
        : extractProviderCost(source)
    if (typeof cost === 'number' && cost > 0) return cost
  }
  return 0
}

export function visionCost(usage: VisionUsage, providerCost?: number): number {
  if (typeof providerCost === 'number' && providerCost > 0) return providerCost
  return tokenUsageCost(BASETEN_VISION_MODEL_ID, {
    cachedInputTokens: usage.cachedTokens,
    inputTokens: usage.promptTokens,
    outputTokens: usage.completionTokens,
  })
}

/** Extract a provider-reported cost from raw response metadata if present. */
function extractProviderCost(
  raw: unknown,
  seen: WeakSet<object> = new WeakSet(),
): number | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  if (seen.has(raw)) return undefined
  seen.add(raw)

  const record = raw as Record<string, unknown>
  const direct = numberFrom(
    record.cost,
    record.total_cost,
    record.totalCost,
    record.estimated_cost,
    record.estimatedCost,
  )
  if (direct !== undefined) return direct

  const nestedCost = record.cost
  if (nestedCost && typeof nestedCost === 'object') {
    const nestedRecord = nestedCost as Record<string, unknown>
    const nested = numberFrom(
      nestedRecord.total,
      nestedRecord.usd,
      nestedRecord.amount,
    )
    if (nested !== undefined) return nested
  }

  for (const value of Object.values(record)) {
    if (!value || typeof value !== 'object') continue
    const nested = extractProviderCost(value, seen)
    if (nested !== undefined) return nested
  }

  return undefined
}

function modelPricing(modelId: string): TokenPricing {
  const normalized = modelId.startsWith('baseten/')
    ? modelId.slice('baseten/'.length)
    : modelId
  return (
    BASETEN_TOKEN_PRICING_USD[normalized] ??
    BASETEN_TOKEN_PRICING_USD[DEFAULT_BASETEN_MODEL_ID]!
  )
}

function numberFrom(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed) && parsed > 0) return parsed
    }
  }
  return undefined
}

function perMillion(usd: number): number {
  return usd / 1_000_000
}

function tokenUsageCost(modelId: string, usage: Usage): number {
  const pricing = modelPricing(modelId)
  const input = usage.inputTokens ?? 0
  const output = usage.outputTokens ?? 0
  const cached = Math.min(input, usage.cachedInputTokens ?? 0)
  const billableInput = Math.max(0, input - cached)
  return (
    billableInput * pricing.input +
    cached * pricing.cachedInput +
    output * pricing.output
  )
}
