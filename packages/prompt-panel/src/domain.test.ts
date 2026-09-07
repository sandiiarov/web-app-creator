import { describe, expect, it } from 'vitest'

import {
  DEFAULT_LANDING_MODELS,
  formatTokenPrice,
  isVisionCapableTextModel,
  liveCapableIds,
  modelPricingFor,
  resolveLandingModels,
  selectLandingModel,
  shouldClearSubmittedDraft,
  syncLandingModels,
  syncedVisionModel,
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
    expect(modelPricingFor('z-ai/glm-5.3')).toEqual({
      cacheRead: 0.26,
      input: 1.4,
      output: 4.4,
    })
    expect(modelPricingFor('z-ai/glm-5.3:nitro')).toEqual(
      modelPricingFor('z-ai/glm-5.3'),
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

describe('vision sync', () => {
  it('detects vision-capable text models, tolerating variants', () => {
    expect(isVisionCapableTextModel('openai/gpt-6-astra:nitro')).toBe(true)
    expect(isVisionCapableTextModel('openai/gpt-6-astra-pro:nitro')).toBe(true)
    expect(isVisionCapableTextModel('z-ai/glm-5.3-flash:nitro')).toBe(true)
    expect(isVisionCapableTextModel('qwen/qwen3.8-flash:nitro')).toBe(true)
    expect(isVisionCapableTextModel('anthropic/claude-fable-5.1:nitro')).toBe(
      true,
    )
    expect(isVisionCapableTextModel('anthropic/claude-opus-5:nitro')).toBe(true)
    expect(isVisionCapableTextModel('google/gemini-3.6-flash:nitro')).toBe(true)
    expect(isVisionCapableTextModel('x-ai/grok-4.6:nitro')).toBe(true)
    expect(isVisionCapableTextModel('z-ai/glm-5.3:nitro')).toBe(false)
    expect(isVisionCapableTextModel('tencent/hy3:nitro')).toBe(false)
    expect(syncedVisionModel('openai/gpt-6-astra:nitro')).toBe(
      'openai/gpt-6-astra',
    )
    expect(syncedVisionModel('z-ai/glm-5.3:nitro')).toBeNull()
  })

  it('forces vision to the text model when it accepts images', () => {
    expect(
      syncLandingModels({
        image: 'bytedance-seed/seedream-4.5',
        text: 'openai/gpt-6-astra:nitro',
        vision: 'bytedance-seed/seed-2.0-mini',
      }).vision,
    ).toBe('openai/gpt-6-astra')
  })

  it('leaves vision free for text-only models', () => {
    const models = {
      image: 'bytedance-seed/seedream-4.5',
      text: 'z-ai/glm-5.3:nitro',
      vision: 'bytedance-seed/seed-2.0-mini',
    }
    expect(syncLandingModels(models)).toEqual(models)
  })

  it('syncs vision when selecting a vision-capable text model', () => {
    const next = selectLandingModel(
      {
        image: 'bytedance-seed/seedream-4.5',
        text: 'z-ai/glm-5.3:nitro',
        vision: 'bytedance-seed/seed-2.0-mini',
      },
      'text',
      'anthropic/claude-sonnet-5:nitro',
    )
    expect(next.text).toBe('anthropic/claude-sonnet-5:nitro')
    expect(next.vision).toBe('anthropic/claude-sonnet-5')
  })

  it('adopts a shared model picked in the vision tab as the text brain', () => {
    const next = selectLandingModel(
      {
        image: 'bytedance-seed/seedream-4.5',
        text: 'z-ai/glm-5.3:nitro',
        vision: 'bytedance-seed/seed-2.0-mini',
      },
      'vision',
      'openai/gpt-6-astra-pro',
    )
    expect(next.text).toBe('openai/gpt-6-astra-pro:nitro')
    expect(next.vision).toBe('openai/gpt-6-astra-pro')
  })

  it('keeps the text brain when picking a vision-only model', () => {
    const next = selectLandingModel(
      {
        image: 'bytedance-seed/seedream-4.5',
        text: 'z-ai/glm-5.3:nitro',
        vision: 'bytedance-seed/seed-2.0-mini',
      },
      'vision',
      'google/gemini-3.5-flash-lite',
    )
    expect(next.text).toBe('z-ai/glm-5.3:nitro')
    expect(next.vision).toBe('google/gemini-3.5-flash-lite')
  })

  it('enforces the invariant when restoring persisted selections', () => {
    expect(
      resolveLandingModels({
        text: 'anthropic/claude-sonnet-5',
        vision: 'bytedance-seed/seed-2.0-mini',
      }),
    ).toEqual({
      image: DEFAULT_LANDING_MODELS.image,
      text: 'anthropic/claude-sonnet-5:nitro',
      vision: 'anthropic/claude-sonnet-5',
    })
  })
})

describe('liveCapableIds', () => {
  it('derives capability from live inputModalities, undefined without them', () => {
    expect(liveCapableIds(undefined)).toBeUndefined()
    expect(liveCapableIds({})).toBeUndefined()
    expect(
      liveCapableIds({
        'acme/text-only': { input: 1, output: 2 },
      }),
    ).toBeUndefined()
    expect(
      liveCapableIds({
        'acme/new-vision': {
          input: 1,
          inputModalities: ['text', 'image'],
          output: 2,
        },
        'acme/text-only': { input: 1, inputModalities: ['text'], output: 2 },
      }),
    ).toEqual(new Set(['acme/new-vision']))
  })

  it('syncs vision to a live-capable model absent from the static options', () => {
    const capableIds = new Set(['acme/new-vision'])
    const next = selectLandingModel(
      {
        image: 'bytedance-seed/seedream-4.5',
        text: 'z-ai/glm-5.3:nitro',
        vision: 'bytedance-seed/seed-2.0-mini',
      },
      'text',
      'acme/new-vision:nitro',
      capableIds,
    )
    expect(next.vision).toBe('acme/new-vision')
    // Without the override, the same model is treated as text-only.
    expect(
      selectLandingModel(
        {
          image: 'bytedance-seed/seedream-4.5',
          text: 'z-ai/glm-5.3:nitro',
          vision: 'bytedance-seed/seed-2.0-mini',
        },
        'text',
        'acme/new-vision:nitro',
      ).vision,
    ).toBe('bytedance-seed/seed-2.0-mini')
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

describe('submission acknowledgment', () => {
  it('clears only the exact accepted draft revision', () => {
    expect(shouldClearSubmittedDraft(4, 4, 'accepted')).toBe(true)
    expect(shouldClearSubmittedDraft(5, 4, 'accepted')).toBe(false)
    expect(shouldClearSubmittedDraft(4, 4, 'rejected')).toBe(false)
    expect(shouldClearSubmittedDraft(4, 4, 'unknown')).toBe(false)
  })
})
