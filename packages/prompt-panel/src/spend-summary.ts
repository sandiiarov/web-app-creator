import type {
  CostBreakdown,
  ImageCost,
  LandingTurn,
  ScrapeCost,
  StatsPart,
  TokenUsage,
  VisionCost,
} from './domain'

export type SpendSummary = {
  cost: number
  costBreakdown: CostBreakdown & {
    image: ImageCost
    vision: VisionCost
  }
  turnCount: number
  usage: TokenUsage
}

export function summarizeSpend(turns: LandingTurn[]): SpendSummary {
  const summary: SpendSummary = {
    cost: 0,
    costBreakdown: {
      image: { cost: 0, count: 0 },
      llm: 0,
      scrape: { calls: 0, cost: 0, credits: 0 },
      total: 0,
      vision: { calls: 0, cost: 0, images: 0 },
    },
    turnCount: 0,
    usage: {},
  }

  for (const turn of turns) {
    const stats = latestStats(turn)
    if (!stats) continue

    summary.turnCount += 1
    summary.cost += stats.cost
    addUsage(summary.usage, stats.usage)

    const breakdown = stats.costBreakdown
    if (!breakdown) {
      summary.costBreakdown.llm += stats.cost
      continue
    }

    summary.costBreakdown.llm += breakdown.llm
    addImageCost(summary.costBreakdown.image, breakdown.image)
    addScrapeCost(summary.costBreakdown.scrape, breakdown.scrape)
    addVisionCost(summary.costBreakdown.vision, breakdown.vision)
  }

  summary.costBreakdown.total = summary.cost
  return summary
}

function addImageCost(target: ImageCost, value: ImageCost | undefined) {
  if (!value) return
  target.cost += value.cost
  target.count += value.count
}

function addScrapeCost(target: ScrapeCost, value: ScrapeCost) {
  target.calls += value.calls
  target.cost += value.cost
  target.credits += value.credits
  if (typeof value.firecrawlCost === 'number') {
    target.firecrawlCost = (target.firecrawlCost ?? 0) + value.firecrawlCost
  }
  if (typeof value.ocrCalls === 'number') {
    target.ocrCalls = (target.ocrCalls ?? 0) + value.ocrCalls
  }
  if (typeof value.ocrCost === 'number') {
    target.ocrCost = (target.ocrCost ?? 0) + value.ocrCost
  }
  if (typeof value.ocrImages === 'number') {
    target.ocrImages = (target.ocrImages ?? 0) + value.ocrImages
  }
}

function addUsage(target: TokenUsage, value: TokenUsage) {
  for (const key of [
    'cachedInputTokens',
    'inputTokens',
    'outputTokens',
    'reasoningTokens',
    'totalTokens',
  ] as const) {
    const next = value[key]
    if (typeof next !== 'number') continue
    target[key] = (target[key] ?? 0) + next
  }
}

function addVisionCost(target: VisionCost, value: undefined | VisionCost) {
  if (!value) return
  target.calls += value.calls
  target.cost += value.cost
  target.images += value.images
}

function latestStats(turn: LandingTurn): StatsPart | undefined {
  for (let index = turn.parts.length - 1; index >= 0; index -= 1) {
    const part = turn.parts[index]
    if (part?.type === 'stats') return part
  }
  return undefined
}
