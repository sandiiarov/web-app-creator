import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  baseModelId,
  parseModelCatalog,
  supportsImageInput,
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
    expect(catalog.get('acme/vision-1')?.has('image')).toBe(true)
    expect(catalog.get('acme/text-1')?.has('image')).toBe(false)
    expect(catalog.get('acme/no-modalities')?.size).toBe(0)
    expect(catalog.get('acme/upper')?.has('image')).toBe(true)
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

    const { supportsImageInput: supports } =
      await import('./model-capabilities.ts')
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

    const { supportsImageInput: supports } =
      await import('./model-capabilities.ts')
    await expect(supports('acme/vision-1')).resolves.toBe(false)
    // Failure was not cached: a later call refetches successfully.
    await expect(supports('acme/vision-1')).resolves.toBe(true)
  })

  it('re-export stays consistent with the module-level helper', () => {
    expect(typeof supportsImageInput).toBe('function')
  })
})
