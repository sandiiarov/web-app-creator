import { describe, expect, it } from 'vitest'

import { DEFAULT_LANDING_MODELS, resolveLandingModels } from './domain'

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
