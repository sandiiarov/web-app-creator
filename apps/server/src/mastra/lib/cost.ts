/**
 * OpenRouter cost accounting.
 *
 * OpenRouter costs are recorded only when response metadata includes a positive
 * cost value. Token and image counts are usage metadata only. Firecrawl is the
 * exception: Firecrawl reports credits, so scrape cost is calculated from the
 * configured USD-per-credit rate.
 */

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

export function calculateLlmCost(_modelId: string, usage: Usage): number {
  return providerReportedCost(usage.raw)
}

export function firecrawlCost(
  creditsUsed: number | undefined,
  creditUsd: number,
): number {
  if (!creditsUsed || creditsUsed <= 0) return 0
  return creditsUsed * creditUsd
}

export function imageGenCost(
  _imagesGenerated: number,
  providerCost?: number,
): number {
  return providerReportedCost(providerCost)
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

export function visionCost(_usage: VisionUsage, providerCost?: number): number {
  return providerReportedCost(providerCost)
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
