import { describe, expect, it } from 'vitest'

import {
  calculateLlmCost,
  firecrawlCost,
  imageGenCost,
  providerReportedCost,
  visionCost,
} from './cost'

describe('calculateLlmCost', () => {
  it('returns zero when OpenRouter cost metadata is absent', () => {
    expect(
      calculateLlmCost('z-ai/glm-5.2', {
        cachedInputTokens: 3360,
        inputTokens: 4981,
        outputTokens: 67,
      }),
    ).toBe(0)
  })

  it('uses provider-reported LLM cost from response metadata', () => {
    expect(
      calculateLlmCost('z-ai/glm-5.2', {
        inputTokens: 100_000,
        outputTokens: 100_000,
        raw: { usage: { cost: 0.0123 } },
      }),
    ).toBe(0.0123)
  })
})

describe('providerReportedCost', () => {
  it('returns zero when a provider response only includes token counts', () => {
    expect(
      providerReportedCost({
        usage: {
          completion_tokens: 8,
          prompt_tokens: 23,
          total_tokens: 31,
        },
      }),
    ).toBe(0)
  })

  it('extracts provider-reported cost from OpenAI-compatible usage metadata', () => {
    expect(
      providerReportedCost({
        usage: {
          completion_tokens: 8,
          cost: 0.0123,
          prompt_tokens: 23,
          total_tokens: 31,
        },
      }),
    ).toBe(0.0123)
  })

  it('prefers the last positive source for cumulative streaming cost', () => {
    expect(
      providerReportedCost(
        { usage: { cost: 0.001 } },
        { usage: { cost: 0.004 } },
      ),
    ).toBe(0.004)
  })

  it('extracts nested provider total cost fields', () => {
    expect(
      providerReportedCost({
        providerMetadata: {
          billing: {
            cost: { total: '0.045' },
          },
        },
      }),
    ).toBe(0.045)
  })
})

describe('tool costs', () => {
  it('calculates Firecrawl USD cost from provider-reported credits', () => {
    expect(firecrawlCost(2, 0.002)).toBe(0.004)
    expect(firecrawlCost(undefined, 0.002)).toBe(0)
  })

  it('returns zero for token/image usage without provider cost metadata', () => {
    expect(
      visionCost({
        cachedTokens: 200,
        completionTokens: 50,
        promptTokens: 1000,
      }),
    ).toBe(0)
    expect(imageGenCost(2)).toBe(0)
  })

  it('uses provider-reported image and vision costs when available', () => {
    expect(imageGenCost(1, 0.011)).toBe(0.011)
    expect(
      visionCost({ completionTokens: 50, promptTokens: 1000 }, 0.006),
    ).toBe(0.006)
  })
})
