import type { ProviderUsageReport } from '../../providers/operation-scope.ts'
import { calculateLlmCost, firecrawlCost } from './cost.ts'
import type { ProjectMessageStatsPart } from './project-store.ts'

/**
 * Per-run cost/stats accounting extracted from `route.ts`'s `runAgentStream`.
 * One tracker per run: accumulates provider-reported LLM cost, scrape
 * (Firecrawl + bundled OCR) cost, image-generation cost, and vision-OCR
 * cost; emits rolling `stats` SSE snapshots after each accrual; enforces the
 * optional per-run USD cap (`config.agentMaxCostUsd`) by escalating to the
 * run's fatal handler. All cost figures are provider-reported — never
 * estimated from token/image counts.
 */

export type RecordedStatsPayload = Omit<ProjectMessageStatsPart, 'type'>

export interface RunStatsTracker {
  /** True when the cap tripped (fatal already escalated via `onFatal`). */
  checkCostCap(): boolean
  emitStats: (finishReason?: string) => void
  /** Record one deduplicated provider usage report at response parse time. */
  recordProviderUsage(report: ProviderUsageReport): void
  /** Sum a terminal provider-cost raw chunk + emit a snapshot (no-op ≤ 0). */
  recordRawProviderCost(cost: number): void
  /** Update the rolling usage snapshot from a step-finish payload + emit. */
  recordStepUsage(payload: {
    output: { usage: unknown }
    totalUsage?: unknown
  }): void
  snapshot(finishReason?: string): RecordedStatsPayload
  usage: UsageSnapshot
}

export interface UsageSnapshot {
  cachedInputTokens?: number
  inputTokens?: number
  outputTokens?: number
  raw?: unknown
  reasoningTokens?: number
  totalTokens?: number
}

export function createRunStatsTracker({
  costCapUsd,
  emit,
  firecrawlCreditUsd,
  onFatal,
  startedAt,
  textModel,
}: {
  costCapUsd?: number
  emit: (event: string, payload: unknown) => void
  firecrawlCreditUsd: number
  onFatal: (message: string) => void
  startedAt: number
  textModel: string
}): RunStatsTracker {
  // Track Firecrawl credits and calculate scrape cost from the configured rate.
  let scrapeCredits = 0
  let scrapeCalls = 0
  // Accumulate image-generation count and OpenRouter-reported cost.
  let imageCostUsd = 0
  let imageCount = 0
  // Accumulate prompt-attachment/screenshot vision OCR metadata.
  let visionCalls = 0
  let visionCostUsd = 0
  let visionImages = 0
  // Sum the final provider-reported cost chunk from every LLM step. OpenRouter
  // reports usage/cost once at the end of each SSE generation, while Mastra's
  // aggregate usage.raw retains only the latest step.
  let llmProviderCostUsd = 0
  // Accumulate bundled image-OCR OpenRouter-reported cost inside scrape cost.
  let scrapeOcrCalls = 0
  let scrapeOcrCostUsd = 0
  let scrapeOcrImages = 0
  // Optional per-run USD cap (config.agentMaxCostUsd). 0/undefined disables it.
  // Checked after each LLM/image/vision cost accrual; aborts the run if exceeded.
  let liveUsage: UsageSnapshot = {}

  const createStatsPayload = (
    usage: UsageSnapshot,
    finishReason: string,
  ): RecordedStatsPayload => {
    const llmCost = calculateLlmCost(textModel, {
      cachedInputTokens: usage.cachedInputTokens,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      raw: llmProviderCostUsd > 0 ? llmProviderCostUsd : usage.raw,
      reasoningTokens: usage.reasoningTokens,
      totalTokens: usage.totalTokens,
    })
    const firecrawlCostUsd = firecrawlCost(scrapeCredits, firecrawlCreditUsd)
    const scrapeCostUsd = firecrawlCostUsd + scrapeOcrCostUsd
    const totalCost = llmCost + scrapeCostUsd + imageCostUsd + visionCostUsd

    return {
      cost: totalCost,
      costBreakdown: {
        image: {
          cost: imageCostUsd,
          count: imageCount,
        },
        llm: llmCost,
        scrape: {
          calls: scrapeCalls,
          cost: scrapeCostUsd,
          credits: scrapeCredits,
          firecrawlCost: firecrawlCostUsd,
          ocrCalls: scrapeOcrCalls,
          ocrCost: scrapeOcrCostUsd,
          ocrImages: scrapeOcrImages,
        },
        total: totalCost,
        vision: {
          calls: visionCalls,
          cost: visionCostUsd,
          images: visionImages,
        },
      },
      durationMs: Date.now() - startedAt,
      finishReason,
      model: textModel,
      usage: {
        cachedInputTokens: usage.cachedInputTokens,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        reasoningTokens: usage.reasoningTokens,
        totalTokens: usage.totalTokens,
      },
    }
  }
  const emitStats = (finishReason = 'in-progress') => {
    emit('stats', createStatsPayload(liveUsage, finishReason))
  }

  const checkCostCap = (): boolean => {
    if (costCapUsd == null || costCapUsd <= 0) return false
    const runCostUsd =
      llmProviderCostUsd +
      firecrawlCost(scrapeCredits, firecrawlCreditUsd) +
      scrapeOcrCostUsd +
      imageCostUsd +
      visionCostUsd
    if (runCostUsd < costCapUsd) return false
    onFatal(`Run exceeded the $${costCapUsd.toFixed(2)} cost cap.`)
    return true
  }

  return {
    checkCostCap,
    emitStats,
    recordProviderUsage(report) {
      if (report.category === 'firecrawl' && report.unit === 'credits') {
        scrapeCredits += report.amount
        scrapeCalls += report.count ?? 1
      } else if (report.category === 'image' && report.unit === 'usd') {
        imageCostUsd += report.amount
        imageCount += report.count ?? 0
      } else if (report.category === 'vision' && report.unit === 'usd') {
        if (report.source === 'scrape') {
          scrapeOcrCostUsd += report.amount
          scrapeOcrCalls += 1
          scrapeOcrImages += report.count ?? 0
        } else {
          visionCostUsd += report.amount
          visionCalls += 1
          visionImages += report.count ?? 0
        }
      }
      emitStats()
      checkCostCap()
    },
    recordRawProviderCost(cost) {
      if (cost <= 0) return
      llmProviderCostUsd += cost
      emitStats()
    },
    recordStepUsage(payload) {
      liveUsage = payload.totalUsage
        ? toUsageSnapshot(payload.totalUsage as UsageSnapshot)
        : addUsageSnapshots(
            liveUsage,
            toUsageSnapshot(payload.output.usage as UsageSnapshot),
          )
      emitStats()
    },
    snapshot(finishReason = 'in-progress') {
      return createStatsPayload(liveUsage, finishReason)
    },
    get usage() {
      return liveUsage
    },
    set usage(value: UsageSnapshot) {
      liveUsage = value
    },
  }
}

function addUsageSnapshots(
  current: UsageSnapshot,
  next: UsageSnapshot,
): UsageSnapshot {
  const sum = (key: keyof Omit<UsageSnapshot, 'raw'>) => {
    const currentValue = current[key]
    const nextValue = next[key]
    if (typeof currentValue !== 'number') return nextValue
    if (typeof nextValue !== 'number') return currentValue
    return currentValue + nextValue
  }

  return {
    cachedInputTokens: sum('cachedInputTokens'),
    inputTokens: sum('inputTokens'),
    outputTokens: sum('outputTokens'),
    raw: next.raw ?? current.raw,
    reasoningTokens: sum('reasoningTokens'),
    totalTokens: sum('totalTokens'),
  }
}

function toUsageSnapshot(usage: UsageSnapshot): UsageSnapshot {
  return {
    cachedInputTokens: usage.cachedInputTokens,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    raw: usage.raw,
    reasoningTokens: usage.reasoningTokens,
    totalTokens: usage.totalTokens,
  }
}
