import { describe, expect, it } from 'vitest'

import {
  DEFAULT_LANDING_MODELS,
  formatTokenPrice,
  modelPricingFor,
  resolveLandingModels,
  VISION_MODEL_OPTIONS,
} from './domain'

describe('model inventory', () => {
  it('defaults vision to ByteDance Seed 2.0 Mini', () => {
    expect(VISION_MODEL_OPTIONS).toContainEqual({
      id: 'bytedance-seed/seed-2.0-mini',
      label: 'Seed 2.0 Mini',
    })
    expect(DEFAULT_LANDING_MODELS.vision).toBe('bytedance-seed/seed-2.0-mini')
  })
})

describe('model pricing', () => {
  it('looks up pricing by base id and tolerates routing variants', () => {
    expect(modelPricingFor('z-ai/glm-5.2')).toEqual({
      cacheRead: 0.078,
      input: 0.42,
      output: 1.32,
    })
    expect(modelPricingFor('z-ai/glm-5.2:nitro')).toEqual(
      modelPricingFor('z-ai/glm-5.2'),
    )
    expect(modelPricingFor('unknown/model')).toBeUndefined()
  })

  it('formats per-million prices compactly', () => {
    expect(formatTokenPrice(5)).toBe('$5')
    expect(formatTokenPrice(1.32)).toBe('$1.32')
    expect(formatTokenPrice(0.42)).toBe('$0.42')
    expect(formatTokenPrice(0.078)).toBe('$0.078')
    expect(formatTokenPrice(0.0028)).toBe('$0.0028')
  })
})

describe('resolveLandingModels', () => {
  it('routes every text model through the OpenRouter nitro variant', () => {
    expect(
      resolveLandingModels({ text: 'deepseek/deepseek-v4-flash' }),
    ).toEqual({
      image: DEFAULT_LANDING_MODELS.image,
      text: 'deepseek/deepseek-v4-flash:nitro',
      vision: DEFAULT_LANDING_MODELS.vision,
    })
    expect(
      resolveLandingModels({ text: 'deepseek/deepseek-v4-flash:floor' }).text,
    ).toBe('deepseek/deepseek-v4-flash:nitro')
    expect(
      resolveLandingModels({ text: DEFAULT_LANDING_MODELS.text }).text,
    ).toBe(DEFAULT_LANDING_MODELS.text)
  })
})
