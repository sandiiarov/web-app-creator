import { describe, expect, it } from 'vitest'

import {
  DEFAULT_LANDING_MODELS,
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
