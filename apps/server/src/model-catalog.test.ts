import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  filterModelPricing,
  getImageModelPricing,
  getModelPricing,
  parseImageEndpointsPricing,
  parseModelPricing,
  resetModelPricingCache,
} from './model-catalog.ts'

function catalogResponse(models: unknown[]) {
  return new Response(JSON.stringify({ data: models }), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  })
}

afterEach(() => {
  resetModelPricingCache()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('parseModelPricing', () => {
  it('converts per-token prices to per-1M and keeps cache read when present', () => {
    expect(
      parseModelPricing({
        data: [
          {
            id: 'z-ai/glm-5.2',
            pricing: {
              completion: '0.00000132',
              input_cache_read: '0.000000078',
              prompt: '0.00000042',
            },
          },
          {
            id: 'bytedance-seed/seed-2.0-mini',
            pricing: { completion: '0.0000004', prompt: '0.0000001' },
          },
        ],
      }),
    ).toEqual({
      'bytedance-seed/seed-2.0-mini': { input: 0.1, output: 0.4 },
      'z-ai/glm-5.2': { cacheRead: 0.078, input: 0.42, output: 1.32 },
    })
  })

  it('parses image-output token prices when present', () => {
    expect(
      parseModelPricing({
        data: [
          {
            id: 'google/gemini-3.1-flash-image',
            pricing: {
              completion: '0.000003',
              image_output: '0.00006',
              prompt: '0.0000005',
            },
          },
        ],
      }),
    ).toEqual({
      'google/gemini-3.1-flash-image': {
        imageOutput: 60,
        input: 0.5,
        output: 3,
      },
    })
  })

  it('parses input modalities when the architecture carries them', () => {
    expect(
      parseModelPricing({
        data: [
          {
            architecture: { input_modalities: ['text', 'Image'] },
            id: 'acme/vision-1',
            pricing: { completion: '0.000001', prompt: '0.000001' },
          },
          {
            id: 'acme/no-arch',
            pricing: { completion: '0.000001', prompt: '0.000001' },
          },
        ],
      }),
    ).toEqual({
      'acme/no-arch': { input: 1, output: 1 },
      'acme/vision-1': { input: 1, inputModalities: ['text', 'image'], output: 1 },
    })
  })

  it('skips entries without an id or usable prompt/completion prices', () => {
    expect(
      parseModelPricing({
        data: [
          { pricing: { completion: '1', prompt: '1' } },
          { id: 'no-pricing' },
          { id: 'partial', pricing: { prompt: '0.1' } },
          { id: 'bad', pricing: { completion: 'x', prompt: 'x' } },
        ],
      }),
    ).toEqual({})
    expect(parseModelPricing({})).toEqual({})
  })
})

describe('parseImageEndpointsPricing', () => {
  it('extracts per-image and per-image-token output prices', () => {
    expect(
      parseImageEndpointsPricing({
        endpoints: [
          {
            pricing: [
              { billable: 'input_image', cost_usd: 0.01, unit: 'image' },
              {
                billable: 'output_image',
                cost_usd: 0.05,
                unit: 'image',
                variant: '1k',
              },
              {
                billable: 'output_image',
                cost_usd: 0.07,
                unit: 'image',
                variant: '2k',
              },
            ],
          },
        ],
      }),
    ).toEqual({ image: 0.05 })
    expect(
      parseImageEndpointsPricing({
        endpoints: [
          {
            pricing: [
              { billable: 'output_image', cost_usd: 0.00003, unit: 'token' },
            ],
          },
        ],
      }),
    ).toEqual({ imageOutput: 30 })
  })

  it('returns null when no output-image pricing exists', () => {
    expect(parseImageEndpointsPricing({})).toBeNull()
    expect(parseImageEndpointsPricing({ endpoints: [{}] })).toBeNull()
    expect(
      parseImageEndpointsPricing({
        endpoints: [
          {
            pricing: [{ billable: 'input_image', cost_usd: 1, unit: 'image' }],
          },
        ],
      }),
    ).toBeNull()
  })
})

describe('getImageModelPricing', () => {
  const endpointsResponse = (pricing: unknown[]) =>
    new Response(JSON.stringify({ endpoints: [{ pricing }] }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    })

  it('fetches, caches, and negative-caches per id', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = String(input)
      if (url.includes('seedream')) {
        return endpointsResponse([
          { billable: 'output_image', cost_usd: 0.04, unit: 'image' },
        ])
      }
      return endpointsResponse([])
    })
    vi.stubGlobal('fetch', fetch)

    const first = await getImageModelPricing([
      'bytedance-seed/seedream-4.5',
      'unknown/model',
    ])
    expect(first).toEqual({
      'bytedance-seed/seedream-4.5': { image: 0.04 },
    })

    const second = await getImageModelPricing([
      'bytedance-seed/seedream-4.5',
      'unknown/model',
    ])
    expect(second).toEqual(first)
    // Both ids cached after the first call — no refetch within the TTL.
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('skips ids whose fetch fails without breaking the rest', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = String(input)
      if (url.includes('seedream')) {
        return endpointsResponse([
          { billable: 'output_image', cost_usd: 0.04, unit: 'image' },
        ])
      }
      return new Response('gone', { status: 404 })
    })
    vi.stubGlobal('fetch', fetch)

    const result = await getImageModelPricing([
      'bytedance-seed/seedream-4.5',
      'openai/gpt-image-2',
    ])
    expect(result).toEqual({
      'bytedance-seed/seedream-4.5': { image: 0.04 },
    })
  })
})

describe('filterModelPricing', () => {
  const catalog = {
    'a/b': { input: 1, output: 2 },
    'c/d': { cacheRead: 0.1, input: 3, output: 4 },
    'e/f': { input: 5, output: 6 },
  }

  it('returns only the requested ids, ignoring unknown ones', () => {
    expect(filterModelPricing(catalog, ['c/d', 'unknown/model'])).toEqual({
      'c/d': { cacheRead: 0.1, input: 3, output: 4 },
    })
  })

  it('returns an empty map when nothing matches', () => {
    expect(filterModelPricing(catalog, [])).toEqual({})
    expect(filterModelPricing(catalog, ['x/y'])).toEqual({})
  })
})

describe('getModelPricing', () => {
  it('fetches once and serves the cache within the TTL', async () => {
    const fetch = vi.fn<() => Promise<Response>>(async () =>
      catalogResponse([
        {
          id: 'a/b',
          pricing: { completion: '0.000001', prompt: '0.000001' },
        },
      ]),
    )
    vi.stubGlobal('fetch', fetch)

    const first = await getModelPricing()
    const second = await getModelPricing()

    expect(first).toEqual({ 'a/b': { input: 1, output: 1 } })
    expect(second).toBe(first)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('dedupes concurrent refreshes into one upstream fetch', async () => {
    const fetch = vi.fn<() => Promise<Response>>(async () =>
      catalogResponse([]),
    )
    vi.stubGlobal('fetch', fetch)

    await Promise.all([getModelPricing(), getModelPricing()])

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('refreshes after the TTL elapses', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn<() => Promise<Response>>(async () =>
      catalogResponse([]),
    )
    vi.stubGlobal('fetch', fetch)

    await getModelPricing()
    vi.advanceTimersByTime(5 * 60 * 1000 + 1)
    await getModelPricing()

    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('serves the stale snapshot when a refresh fails', async () => {
    vi.useFakeTimers()
    const fetch = vi
      .fn<() => Promise<Response>>()
      .mockImplementationOnce(async () =>
        catalogResponse([
          { id: 'a/b', pricing: { completion: '1', prompt: '1' } },
        ]),
      )
      .mockImplementation(async () => new Response('nope', { status: 500 }))
    vi.stubGlobal('fetch', fetch)

    const first = await getModelPricing()
    vi.advanceTimersByTime(5 * 60 * 1000 + 1)
    const pending = getModelPricing()
    // boundedFetch retries the 500 with backoff; flush the retry timers.
    await vi.advanceTimersByTimeAsync(2_000)
    const second = await pending

    expect(second).toBe(first)
  })

  it('throws when the first fetch fails and no snapshot exists', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn<() => Promise<Response>>(
        async () => new Response('down', { status: 500 }),
      ),
    )

    const pending = getModelPricing()
    pending.catch(() => {}) // mark handled before the rejection settles
    await vi.advanceTimersByTimeAsync(2_000)
    await expect(pending).rejects.toThrow(/500/)
  })
})
