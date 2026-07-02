import { afterEach, describe, expect, it, vi } from 'vitest'

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
  it('returns a clear result when OpenRouter is not configured', async () => {
    const { ocrImageInputs } = await loadImageOcr({ openrouterApiKey: '' })
    const fetch = vi.fn<FetchMock>()
    vi.stubGlobal('fetch', fetch)

    const result = await ocrImageInputs([
      { dataUrl: PNG_DATA_URL, sourceLabel: 'wireframe.png' },
    ])

    expect(result).toMatchObject({
      imagesAnalyzed: 0,
      ok: false,
      text: '',
      usage: null,
    })
    expect(result.reason).toContain('OPENROUTER_API_KEY')
    expect(fetch).not.toHaveBeenCalled()
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
    const fetch = vi.fn<FetchMock>(async (input) => {
      const url = String(input)
      if (url.includes('/generation')) {
        return jsonResponse({ data: {} })
      }
      return jsonResponse({
        choices: [
          { message: { content: 'Image 1\nHero copy: Launch faster' } },
        ],
        id: 'gen-1',
        usage: {
          completion_tokens: 7,
          cost: 0.002,
          prompt_tokens: 11,
          prompt_tokens_details: { cached_tokens: 3 },
          total_tokens: 18,
        },
      })
    })
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
        content: Array<{
          image_url?: { url: string }
          text?: string
          type: string
        }>
      }>
      model: string
    }
    expect(body.model).toBe('z-ai/glm-5v-turbo')
    expect(body.messages[0]!.content[0]).toMatchObject({
      text: expect.stringContaining('hero.png'),
      type: 'text',
    })
    expect(
      body.messages[0]!.content.filter((part) => part.type === 'image_url'),
    ).toEqual([
      {
        image_url: { url: PNG_DATA_URL },
        type: 'image_url',
      },
    ])
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
      if (url.includes('/generation')) {
        return jsonResponse({ data: {} })
      }
      return jsonResponse({
        choices: [{ message: { content: 'Image 1\nNo text found' } }],
        id: 'gen-2',
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
      messages: Array<{ content: Array<{ image_url?: { url: string } }> }>
    }
    expect(chatBody.messages[0]!.content[1]!.image_url?.url).toBe(WEBP_DATA_URL)
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

async function loadImageOcr({
  openrouterApiKey = 'test-openrouter-key',
}: {
  openrouterApiKey?: string
} = {}): Promise<ImageOcrModule> {
  vi.resetModules()
  vi.stubEnv('BASETEN_API_KEY', 'test-baseten-key')
  vi.stubEnv('OPENROUTER_API_KEY', openrouterApiKey)
  return import('./image-ocr.ts')
}
