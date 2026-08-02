import { config } from '../../config.ts'
import {
  calculateLlmCost,
  firecrawlCost,
  imageGenCost,
  visionCost,
} from './cost.ts'
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
  /** Accumulate prompt-attachment vision OCR metadata + emit a snapshot. */
  recordAttachmentVision(analysis: {
    cost: number
    ok: boolean
    visionImages: number
  }): void
  /** Accumulate generate_image cost. Returns true when cost was added. */
  recordGenerateImage(result: {
    cost?: number
    imagesGenerated?: number
  }): boolean
  /** Sum a terminal provider-cost raw chunk + emit a snapshot (no-op ≤ 0). */
  recordRawProviderCost(cost: number): void
  /** Accumulate Firecrawl credits + bundled scrape OCR cost. */
  recordScrapeResult(result: {
    creditsUsed?: number
    imageOcr?: ResultImageOcr
  }): void
  /** Accumulate screenshot vision OCR metadata. Returns true when cost was added. */
  recordScreenshotOcr(result: { imageOcr?: ResultImageOcr }): boolean
  /** Update the rolling usage snapshot from a step-finish payload + emit. */
  recordStepUsage(payload: {
    output: { usage: unknown }
    totalUsage?: unknown
  }): void
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

interface ImageOcrUsage {
  cachedTokens?: number
  completionTokens?: number
  promptTokens?: number
}

interface ResultImageOcr {
  cost?: number
  imagesAnalyzed?: number
  ok?: boolean
  usage?: ImageOcrUsage | null
}

export function createRunStatsTracker({
  emit,
  onFatal,
  startedAt,
  textModel,
}: {
  emit: (event: string, payload: unknown) => void
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
  const costCapUsd = config.agentMaxCostUsd

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
    const firecrawlCostUsd = firecrawlCost(
      scrapeCredits,
      config.firecrawl.creditUsd,
    )
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
    if (costCapUsd <= 0) return false
    const runCostUsd = llmProviderCostUsd + imageCostUsd + visionCostUsd
    if (runCostUsd < costCapUsd) return false
    onFatal(`Run exceeded the $${costCapUsd.toFixed(2)} cost cap.`)
    return true
  }

  return {
    checkCostCap,
    emitStats,
    recordAttachmentVision(analysis) {
      visionImages += analysis.visionImages
      visionCostUsd += analysis.cost
      if (analysis.ok) visionCalls += 1
      emitStats()
    },
    recordGenerateImage(result) {
      if (typeof result.imagesGenerated !== 'number') return false
      imageCount += result.imagesGenerated
      imageCostUsd += imageGenCost(result.imagesGenerated, result.cost)
      return true
    },
    recordRawProviderCost(cost) {
      if (cost <= 0) return
      llmProviderCostUsd += cost
      emitStats()
    },
    recordScrapeResult(result) {
      scrapeCalls += 1
      if (typeof result.creditsUsed === 'number') {
        scrapeCredits += result.creditsUsed
      }
      const imageOcr = result.imageOcr
      if (imageOcr?.ok && (imageOcr.imagesAnalyzed ?? 0) > 0) {
        scrapeOcrCalls += 1
        scrapeOcrImages += imageOcr.imagesAnalyzed ?? 0
        scrapeOcrCostUsd += visionCost(
          {
            cachedTokens: imageOcr.usage?.cachedTokens,
            completionTokens: imageOcr.usage?.completionTokens,
            promptTokens: imageOcr.usage?.promptTokens,
          },
          imageOcr.cost,
        )
      }
    },
    recordScreenshotOcr(result) {
      const imageOcr = result.imageOcr
      if (!imageOcr?.ok || (imageOcr.imagesAnalyzed ?? 0) <= 0) return false
      visionCalls += 1
      visionImages += imageOcr.imagesAnalyzed ?? 0
      visionCostUsd += visionCost(
        {
          cachedTokens: imageOcr.usage?.cachedTokens,
          completionTokens: imageOcr.usage?.completionTokens,
          promptTokens: imageOcr.usage?.promptTokens,
        },
        imageOcr.cost,
      )
      return true
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
