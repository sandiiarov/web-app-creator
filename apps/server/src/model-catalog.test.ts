import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  getModelPricing,
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
