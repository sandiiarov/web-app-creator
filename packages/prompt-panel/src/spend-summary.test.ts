import { describe, expect, it } from 'vitest'

import type { LandingTurn, StatsPart } from './domain'
import { summarizeSpend } from './spend-summary'

function stats(overrides: Partial<StatsPart> = {}): StatsPart {
  return {
    cost: 0.1,
    costBreakdown: {
      image: { cost: 0.02, count: 1 },
      llm: 0.05,
      scrape: {
        calls: 1,
        cost: 0.01,
        credits: 2,
        firecrawlCost: 0.004,
        ocrCalls: 1,
        ocrCost: 0.006,
        ocrImages: 2,
      },
      total: 0.1,
      vision: { calls: 1, cost: 0.02, images: 1 },
    },
    durationMs: 100,
    finishReason: 'stop',
    model: 'model',
    type: 'stats',
    usage: {
      cachedInputTokens: 50,
      inputTokens: 100,
      outputTokens: 20,
      reasoningTokens: 10,
      totalTokens: 120,
    },
    ...overrides,
  }
}

function turn(id: string, parts: LandingTurn['parts']): LandingTurn {
  return {
    htmlSwaps: 0,
    id,
    isStreaming: false,
    model: 'model',
    parts,
    prompt: 'Build it',
  }
}

describe('summarizeSpend', () => {
  it('aggregates cost and tokens across completed turns', () => {
    const summary = summarizeSpend([
      turn('turn-1', [stats()]),
      turn('turn-2', [
        stats({
          cost: 0.25,
          costBreakdown: {
            image: { cost: 0, count: 0 },
            llm: 0.2,
            scrape: { calls: 0, cost: 0, credits: 0 },
            total: 0.25,
            vision: { calls: 2, cost: 0.05, images: 2 },
          },
          usage: {
            cachedInputTokens: 100,
            inputTokens: 300,
            outputTokens: 40,
            reasoningTokens: 20,
            totalTokens: 340,
          },
        }),
      ]),
      turn('turn-streaming', [
        { id: 'text-1', text: 'Still working', type: 'text' },
      ]),
    ])

    expect(summary).toEqual({
      cost: 0.35,
      costBreakdown: {
        image: { cost: 0.02, count: 1 },
        llm: 0.25,
        scrape: {
          calls: 1,
          cost: 0.01,
          credits: 2,
          firecrawlCost: 0.004,
          ocrCalls: 1,
          ocrCost: 0.006,
          ocrImages: 2,
        },
        total: 0.35,
        vision: { calls: 3, cost: 0.07, images: 3 },
      },
      turnCount: 2,
      usage: {
        cachedInputTokens: 150,
        inputTokens: 400,
        outputTokens: 60,
        reasoningTokens: 30,
        totalTokens: 460,
      },
    })
  })

  it('uses only the latest stats event in a message and supports legacy stats', () => {
    const summary = summarizeSpend([
      turn('turn-1', [
        stats({ cost: 99 }),
        stats({ cost: 0.03, costBreakdown: undefined }),
      ]),
    ])

    expect(summary.cost).toBe(0.03)
    expect(summary.costBreakdown.llm).toBe(0.03)
    expect(summary.turnCount).toBe(1)
  })
})
