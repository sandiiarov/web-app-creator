import { afterEach, describe, expect, it, vi } from 'vitest'

import { boundedFetch } from './bounded-fetch.ts'

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgo='
const WEBP_DATA_URL = 'data:image/webp;base64,UklGRg=='

type FetchMock = typeof globalThis.fetch
type ImageOcrModule = typeof import('./image-ocr.ts')

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('ocrImageInputs', () => {
  it('returns an empty success without calling OpenRouter for empty inputs', async () => {
    const { ocrImageInputs } = await loadImageOcr()
    const fetch = vi.fn<FetchMock>()
    vi.stubGlobal('fetch', fetch)

    await expect(ocrImageInputs([])).resolves.toEqual({
      imagesAnalyzed: 0,
      ok: true,
      text: '',
      usage: null,
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('uses the OpenRouter vision model for OCR', async () => {
    const { ocrImageInputs } = await loadImageOcr()
    vi.stubEnv('OPENROUTER_API_KEY', '')
    const fetch = vi.fn<FetchMock>(async () =>
      jsonResponse({
        choices: [{ message: { content: 'Image 1\nHero copy visible' } }],
        usage: { completion_tokens: 4, cost: 0.001, prompt_tokens: 9 },
      }),
    )
    vi.stubGlobal('fetch', fetch)

    const result = await ocrImageInputs([
      { dataUrl: PNG_DATA_URL, sourceLabel: 'wireframe.png' },
    ])

    expect(result).toMatchObject({
      cost: 0.001,
      imagesAnalyzed: 1,
      ok: true,
      text: 'Image 1\nHero copy visible',
    })

    const [chatUrl, chatInit] = fetch.mock.calls[0]!
    expect(String(chatUrl)).toBe(
      'https://openrouter.ai/api/v1/chat/completions',
    )
    expect((chatInit as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer test-openrouter-key',
    })
  })

  it('rejects unsupported data URL media types before calling OpenRouter', async () => {
    const { ocrImageInputs } = await loadImageOcr()
    const fetch = vi.fn<FetchMock>()
    vi.stubGlobal('fetch', fetch)

    const result = await ocrImageInputs([
      {
        dataUrl: 'data:image/svg+xml;base64,PHN2Zy8+',
        sourceLabel: 'logo.svg',
      },
    ])

    expect(result).toMatchObject({ imagesAnalyzed: 0, ok: false })
    expect(result.reason).toContain(
      'Unsupported image media type: image/svg+xml',
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  it('deduplicates data URLs and sends normalized image parts to OpenRouter', async () => {
    const { ocrImageInputs } = await loadImageOcr()
    const fetch = vi.fn<FetchMock>(async () =>
      jsonResponse({
        choices: [
          { message: { content: 'Image 1\nHero copy: Launch faster' } },
        ],
        usage: {
          completion_tokens: 7,
          cost: 0.002,
          prompt_tokens: 11,
          prompt_tokens_details: { cached_tokens: 3 },
          total_tokens: 18,
        },
      }),
    )
    vi.stubGlobal('fetch', fetch)

    const result = await ocrImageInputs([
      { dataUrl: `${PNG_DATA_URL}\n`, sourceLabel: 'hero.png' },
      { dataUrl: PNG_DATA_URL, sourceLabel: 'duplicate.png' },
    ])

    expect(result).toMatchObject({
      cost: 0.002,
      imagesAnalyzed: 1,
      ok: true,
      text: 'Image 1\nHero copy: Launch faster',
      usage: {
        cachedTokens: 3,
        completionTokens: 7,
        promptTokens: 11,
        totalTokens: 18,
      },
    })

    const [chatUrl, chatInit] = fetch.mock.calls[0]!
    expect(String(chatUrl)).toBe(
      'https://openrouter.ai/api/v1/chat/completions',
    )
    const body = JSON.parse((chatInit as RequestInit).body as string) as {
      messages: Array<{
        content:
          | Array<{
              image_url?: { url: string }
              text?: string
              type: string
            }>
          | string
        role: string
      }>
      model: string
    }
    expect(body.model).toBe('z-ai/glm-5v-turbo')
    const systemMessage = body.messages[0] as { content: string; role: string }
    expect(systemMessage).toMatchObject({ role: 'system' })
    expect(systemMessage.content).toEqual(
      expect.stringContaining('senior frontend engineer'),
    )
    const userMessage = body.messages[1] as {
      content: Array<{ text?: string; type: string }>
      role: string
    }
    expect(userMessage.role).toBe('user')
    const userContent = userMessage.content
    expect(userContent[0]).toMatchObject({
      text: expect.stringContaining('hero.png'),
      type: 'text',
    })
    expect(userContent.filter((part) => part.type === 'image_url')).toEqual([
      {
        image_url: { url: PNG_DATA_URL },
        type: 'image_url',
      },
    ])
  })

  it('surfaces OpenRouter HTTP and JSON errors', async () => {
    const { ocrImageInputs } = await loadImageOcr()

    vi.stubGlobal(
      'fetch',
      vi.fn<FetchMock>(
        async () => new Response('upstream down', { status: 503 }),
      ),
    )
    await expect(
      ocrImageInputs([{ dataUrl: PNG_DATA_URL, sourceLabel: 'hero.png' }]),
    ).resolves.toMatchObject({
      imagesAnalyzed: 1,
      ok: false,
      reason: 'OpenRouter vision error (503): upstream down',
    })

    vi.stubGlobal(
      'fetch',
      vi.fn<FetchMock>(async () =>
        jsonResponse({ error: { code: 'bad_request', message: 'bad image' } }),
      ),
    )
    await expect(
      ocrImageInputs([{ dataUrl: PNG_DATA_URL, sourceLabel: 'hero.png' }]),
    ).resolves.toMatchObject({
      ok: false,
      reason: 'OpenRouter vision error (bad_request): bad image',
    })
  })

  it('uses reasoning fallbacks and provider cost aliases', async () => {
    const { ocrImageInputs } = await loadImageOcr()
    vi.stubGlobal(
      'fetch',
      vi.fn<FetchMock>(async () =>
        jsonResponse({
          choices: [
            {
              message: {
                content: ' ',
                reasoning_details: [
                  { text: 'Image 1' },
                  { text: 'CTA visible' },
                ],
              },
            },
          ],
          usage: { estimated_cost: 0.007 },
        }),
      ),
    )

    await expect(
      ocrImageInputs([{ dataUrl: PNG_DATA_URL, sourceLabel: 'hero.png' }]),
    ).resolves.toMatchObject({
      cost: 0.007,
      ok: true,
      text: 'Image 1\nCTA visible',
    })
  })

  it('propagates an external abort instead of converting it to an OCR failure', async () => {
    const { ocrImageInputs } = await loadImageOcr()
    const fetch = vi.fn<FetchMock>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason),
            { once: true },
          )
        }),
    )
    vi.stubGlobal('fetch', fetch)
    const controller = new AbortController()

    const pending = ocrImageInputs(
      [{ dataUrl: PNG_DATA_URL, sourceLabel: 'hero.png' }],
      undefined,
      undefined,
      undefined,
      { signal: controller.signal },
    )
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'AbortError',
    })
    controller.abort()

    await rejected
    expect(fetch).toHaveBeenCalledOnce()
  })
})

describe('ocrImages', () => {
  it('preserves URL input behavior by fetching image URLs before OpenRouter', async () => {
    const { ocrImages } = await loadImageOcr()
    const fetch = vi.fn<FetchMock>(async (input) => {
      const url = String(input)
      if (url === 'https://example.test/brand.webp') {
        return new Response(base64Bytes('UklGRg=='), {
          headers: { 'content-type': 'image/webp' },
          status: 200,
        })
      }
      return jsonResponse({
        choices: [{ message: { content: 'Image 1\nNo text found' } }],
        usage: { completion_tokens: 2, prompt_tokens: 4, total_tokens: 6 },
      })
    })
    vi.stubGlobal('fetch', fetch)

    const result = await ocrImages(['https://example.test/brand.webp'])

    expect(result).toMatchObject({
      imagesAnalyzed: 1,
      ok: true,
      text: 'Image 1\nNo text found',
    })
    const chatBody = JSON.parse(fetch.mock.calls[1]![1]!.body as string) as {
      messages: Array<{
        content: Array<{ image_url?: { url: string } }> | string
      }>
    }
    const userContent = chatBody.messages[1]!.content as Array<{
      image_url?: { url: string }
    }>
    expect(userContent[1]!.image_url?.url).toBe(WEBP_DATA_URL)
  })

  it('summarizes URL fetch failures when no images load', async () => {
    const { ocrImages } = await loadImageOcr()
    vi.stubGlobal(
      'fetch',
      vi.fn<FetchMock>(async () => new Response('nope', { status: 404 })),
    )

    const result = await ocrImages(['https://example.test/missing.png'])

    expect(result).toMatchObject({ imagesAnalyzed: 0, ok: false, usage: null })
    expect(result.reason).toContain('https://example.test/missing.png')
    expect(result.reason).toContain('Failed to fetch image (404)')
  })

  it('rejects fetched URLs without supported image media types', async () => {
    const { ocrImages } = await loadImageOcr()
    vi.stubGlobal(
      'fetch',
      vi.fn<FetchMock>(
        async () =>
          new Response('plain text', {
            headers: { 'content-type': 'text/plain' },
            status: 200,
          }),
      ),
    )

    await expect(
      ocrImages(['https://example.test/readme.txt']),
    ).resolves.toMatchObject({
      imagesAnalyzed: 0,
      ok: false,
      reason: expect.stringContaining('URL is not a supported image'),
    })
  })

  it('fails fast when a scraped image URL hangs', async () => {
    const { ocrImages } = await loadImageOcr()
    const fetch = vi.fn<FetchMock>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => {
              const err = new Error('The operation was aborted')
              err.name = 'AbortError'
              reject(err)
            },
            { once: true },
          )
        }),
    )
    vi.stubGlobal('fetch', fetch)

    // fetchAsDataUrl uses a 15s timeout x 2 attempts; fast-forward fake timers
    // so the abort/retry chain resolves deterministically.
    vi.useFakeTimers()
    const pending = ocrImages(['https://example.test/slow.png'])
    await vi.advanceTimersByTimeAsync(40_000)
    vi.useRealTimers()
    const result = await pending

    expect(result).toMatchObject({ ok: false })
    expect(result.reason).toContain('https://example.test/slow.png')
  })
})

describe('boundedFetch', () => {
  it('retries on 5xx and returns the success response once it recovers', async () => {
    const fetch = vi.fn<FetchMock>(async () => jsonResponse({ ok: true }))
    fetch
      .mockReturnValueOnce(
        Promise.resolve(new Response('down', { status: 503 })),
      )
      .mockReturnValueOnce(
        Promise.resolve(new Response('down', { status: 503 })),
      )
      .mockReturnValueOnce(Promise.resolve(jsonResponse({ ok: true })))
    vi.stubGlobal('fetch', fetch)

    const result = await boundedFetch(
      'https://x.test',
      { method: 'POST' },
      { baseDelayMs: 0, timeoutMs: 1000 },
    )

    expect(result.ok).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('returns the last 5xx response after exhausting retries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<FetchMock>(async () => new Response('down', { status: 503 })),
    )

    const result = await boundedFetch(
      'https://x.test',
      { method: 'POST' },
      { baseDelayMs: 0, maxAttempts: 3, timeoutMs: 1000 },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.response.status).toBe(503)
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('does not retry 4xx responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<FetchMock>(async () => new Response('bad', { status: 400 })),
    )

    const result = await boundedFetch(
      'https://x.test',
      { method: 'POST' },
      { baseDelayMs: 0, timeoutMs: 1000 },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.response.status).toBe(400)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('times out, retries, and surfaces a timeout reason when fetch hangs', async () => {
    // Mock fetch that honors the abort signal (rejects with AbortError on abort).
    vi.stubGlobal(
      'fetch',
      vi.fn<FetchMock>(
        (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              'abort',
              () => {
                const err = new Error('The operation was aborted')
                err.name = 'AbortError'
                reject(err)
              },
              { once: true },
            )
          }),
      ),
    )

    const result = await boundedFetch(
      'https://x.test',
      { method: 'POST' },
      { baseDelayMs: 0, maxAttempts: 3, timeoutMs: 5 },
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected not ok')
    expect(result.reason).toMatch(/timed out/i)
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('propagates an external abort without retrying a hanging fetch', async () => {
    const fetch = vi.fn<FetchMock>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason),
            { once: true },
          )
        }),
    )
    vi.stubGlobal('fetch', fetch)
    const controller = new AbortController()

    const pending = boundedFetch(
      'https://x.test',
      { method: 'POST' },
      { baseDelayMs: 0, signal: controller.signal, timeoutMs: 1000 },
    )
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'AbortError',
    })
    controller.abort()

    await rejected
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('cancels retry backoff after a transient response', async () => {
    const fetch = vi.fn<FetchMock>(async () =>
      Promise.resolve(new Response('down', { status: 503 })),
    )
    vi.stubGlobal('fetch', fetch)
    const controller = new AbortController()

    const pending = boundedFetch(
      'https://x.test',
      { method: 'POST' },
      { baseDelayMs: 10_000, signal: controller.signal, timeoutMs: 1000 },
    )
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'AbortError',
    })
    controller.abort()

    await rejected
    expect(fetch).toHaveBeenCalledOnce()
  })
})

function base64Bytes(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, 'base64'))
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  })
}

async function loadImageOcr(): Promise<ImageOcrModule> {
  vi.resetModules()
  vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
  return import('./image-ocr.ts')
}
