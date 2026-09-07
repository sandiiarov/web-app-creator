import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  baseModelId,
  createModelCapabilities,
  parseModelCatalog,
} from './model-capabilities.ts'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('baseModelId', () => {
  it('strips OpenRouter variant suffixes', () => {
    expect(baseModelId('z-ai/glm-5.2:nitro')).toBe('z-ai/glm-5.2')
    expect(baseModelId('openai/gpt-5:free')).toBe('openai/gpt-5')
  })

  it('keeps bare ids untouched', () => {
    expect(baseModelId('z-ai/glm-5.2')).toBe('z-ai/glm-5.2')
  })
})

describe('parseModelCatalog', () => {
  it('maps model ids to lowercase input modalities', () => {
    const catalog = parseModelCatalog({
      data: [
        {
          architecture: { input_modalities: ['text', 'image'] },
          id: 'acme/vision-1',
        },
        { architecture: { input_modalities: ['text'] }, id: 'acme/text-1' },
        { id: 'acme/no-modalities' },
        { architecture: { input_modalities: ['IMAGE'] }, id: 'acme/upper' },
      ],
    })
    expect(catalog.get('acme/vision-1')?.modalities.has('image')).toBe(true)
    expect(catalog.get('acme/text-1')?.modalities.has('image')).toBe(false)
    expect(catalog.get('acme/no-modalities')?.modalities.size).toBe(0)
    expect(catalog.get('acme/upper')?.modalities.has('image')).toBe(true)
  })

  it('captures context_length when positive and finite', () => {
    const catalog = parseModelCatalog({
      data: [
        { context_length: 202_752, id: 'acme/big' },
        { context_length: 0, id: 'acme/zero' },
        { context_length: Number.NaN, id: 'acme/nan' },
        { id: 'acme/absent' },
      ],
    })
    expect(catalog.get('acme/big')?.contextLength).toBe(202_752)
    expect(catalog.get('acme/zero')?.contextLength).toBeUndefined()
    expect(catalog.get('acme/nan')?.contextLength).toBeUndefined()
    expect(catalog.get('acme/absent')?.contextLength).toBeUndefined()
  })
})

describe('contextWindowTokens', () => {
  it('resolves from the catalog, stripping variant suffixes', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key')
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      return new Response(
        JSON.stringify({
          data: [
            { context_length: 202_752, id: 'acme/big' },
            { id: 'acme/no-length' },
          ],
        }),
        { status: 200 },
      )
    })
    vi.stubGlobal('fetch', fetch)

    const { contextWindowTokens: contextWindow } = createModelCapabilities({
      apiKey: 'test-key',
      chatApiUrl: 'https://openrouter.test/api/v1',
    })
    await expect(contextWindow('acme/big:nitro')).resolves.toBe(202_752)
    await expect(contextWindow('acme/no-length')).resolves.toBeUndefined()
    await expect(contextWindow('acme/unknown')).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

describe('supportsImageInput', () => {
  it('resolves from the catalog, stripping variant suffixes', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key')
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      return new Response(
        JSON.stringify({
          data: [
            {
              architecture: { input_modalities: ['text', 'image'] },
              id: 'acme/vision-1',
            },
            { architecture: { input_modalities: ['text'] }, id: 'acme/text-1' },
          ],
        }),
        { status: 200 },
      )
    })
    vi.stubGlobal('fetch', fetch)

    const { supportsImageInput: supports } = createModelCapabilities({
      apiKey: 'test-key',
      chatApiUrl: 'https://openrouter.test/api/v1',
    })
    await expect(supports('acme/vision-1:nitro')).resolves.toBe(true)
    await expect(supports('acme/text-1')).resolves.toBe(false)
    await expect(supports('acme/unknown')).resolves.toBe(false)
    // Cached after the first fetch.
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(String(fetch.mock.calls[0]?.[0])).toContain('/models')
  })

  it('falls back to false when the catalog fetch fails, and retries next time', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key')
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new Error('network down'))
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                architecture: { input_modalities: ['text', 'image'] },
                id: 'acme/vision-1',
              },
            ],
          }),
          { status: 200 },
        ),
      )
    vi.stubGlobal('fetch', fetch)

    const { supportsImageInput: supports } = createModelCapabilities({
      apiKey: 'test-key',
      chatApiUrl: 'https://openrouter.test/api/v1',
    })
    await expect(supports('acme/vision-1')).resolves.toBe(false)
    // Failure was not cached: a later call refetches successfully.
    await expect(supports('acme/vision-1')).resolves.toBe(true)
  })

  it('creates an instance-owned helper', () => {
    const capabilities = createModelCapabilities({
      apiKey: 'test-key',
      chatApiUrl: 'https://openrouter.test/api/v1',
    })
    expect(typeof capabilities.supportsImageInput).toBe('function')
  })
})
