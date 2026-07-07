import { afterEach, describe, expect, it, vi } from 'vitest'

import { grepHtml } from '../lib/grep-search.ts'
import { createHtmlStore } from '../lib/html-store.ts'
import { getImage, saveImage } from '../lib/image-store.ts'
import { createGrepTool } from './grep.ts'
import { createScreenshotTool } from './screenshot.ts'

type FetchMock = typeof globalThis.fetch

afterEach(() => {
  vi.doUnmock('firecrawl')
  vi.doUnmock('../lib/image-ocr.ts')
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
  vi.restoreAllMocks()
})

describe('grepHtml', () => {
  it('searches literal text with context, limits, and truncation notices', async () => {
    const longLine = 'x'.repeat(520)
    const result = grepHtml(
      `alpha\n<button>Buy now</button>\n${longLine} Buy now\nBuy now again`,
      'Buy now',
      { context: 1, limit: 2, literal: true },
    )

    expect(result).toMatchObject({
      matchCount: 2,
      matchLimitReached: true,
      truncatedLines: true,
    })
    expect(result.output).toContain('1- alpha')
    expect(result.output).toContain('2: <button>Buy now</button>')
    expect(result.output).toContain('matches limit reached')
    expect(result.output).toContain('Some lines truncated')
  })

  it('reports invalid regexes and no-match searches', () => {
    expect(grepHtml('hello', '[')).toMatchObject({
      matchCount: 0,
      notices: [expect.stringContaining('Invalid regex')],
      output: '',
    })
    expect(grepHtml('hello', 'missing', { ignoreCase: true })).toMatchObject({
      matchCount: 0,
      output: 'No matches found',
    })
  })

  it('wraps grep results in the Mastra tool response shape', async () => {
    const tool = createGrepTool(createHtmlStore('<main>Launch</main>\n'))
    const result = await tool.execute?.(
      {
        action: 'Find launch copy',
        literal: true,
        pattern: 'Launch',
      },
      undefined as never,
    )

    expect(result).toMatchObject({
      matchCount: 1,
      rawMatches: [{ lineNumber: 1, text: '<main>Launch</main>' }],
      text: expect.stringContaining('Use rawMatches/read rawText'),
    })
  })
})

describe('image-store', () => {
  it('stores images with media-type specific extensions', () => {
    const jpegId = saveImage(
      Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      'image/jpeg',
    )
    const svgId = saveImage(Buffer.from('<svg />'), 'image/svg+xml')
    const webpId = saveImage(Buffer.from('RIFFxxxxWEBP'), 'image/webp')
    const gifId = saveImage(Buffer.from('GIF89a'), 'image/gif')
    const fallbackId = saveImage(Buffer.from('raw'), 'application/octet-stream')

    expect(getImage(jpegId)).toMatchObject({ extension: 'jpg' })
    expect(getImage(svgId)).toMatchObject({ extension: 'svg' })
    expect(getImage(webpId)).toMatchObject({ extension: 'webp' })
    expect(getImage(gifId)).toMatchObject({ extension: 'gif' })
    expect(getImage(fallbackId)).toMatchObject({ extension: 'png' })
  })
})

describe('createGenerateImageTool', () => {
  it('returns a clear failure when OpenRouter is not configured', async () => {
    const { createGenerateImageTool } = await loadGenerateImageTool()
    const tool = createGenerateImageTool('http://server.test')

    const result = await tool.execute?.(
      {
        action: 'Create a hero image',
        prompt: 'A cinematic product render on a clean desk',
      },
      undefined as never,
    )

    expect(result).toMatchObject({
      imagesGenerated: 0,
      ok: false,
      reason: expect.stringContaining('OPENROUTER_API_KEY is not set'),
      url: null,
    })
  })

  it('saves successful image responses and detects image media types', async () => {
    const { createGenerateImageTool } = await loadGenerateImageTool({
      OPENROUTER_API_KEY: 'openrouter-key',
    })
    const fetch = vi.fn<FetchMock>(async () =>
      jsonResponse({
        data: [
          {
            b64_json: Buffer.from([0xff, 0xd8, 0xff, 0x00]).toString('base64'),
          },
        ],
        usage: { cost: 0.031 },
      }),
    )
    vi.stubGlobal('fetch', fetch)

    const tool = createGenerateImageTool('http://server.test')
    const result = await tool.execute?.(
      {
        action: 'Create a square product image',
        aspectRatio: '1:1',
        prompt: 'A detailed product render in soft studio light',
      },
      undefined as never,
    )
    if (!result || !('url' in result)) {
      throw new Error('Expected generate_image result with a URL')
    }

    expect(result).toMatchObject({
      cost: 0.031,
      imagesGenerated: 1,
      ok: true,
      url: expect.stringMatching(
        /^http:\/\/server\.test\/images\/img-\d+\.jpg$/,
      ),
    })
    const id = String(result.url).match(/images\/(img-\d+)\.jpg/)?.[1]
    const { getImage: getGeneratedImage } =
      await import('../lib/image-store.ts')
    expect(id ? getGeneratedImage(id) : undefined).toMatchObject({
      extension: 'jpg',
      mediaType: 'image/jpeg',
    })
    expect(JSON.parse(fetch.mock.calls[0]![1]!.body as string)).toMatchObject({
      aspect_ratio: '1:1',
      model: 'bytedance-seed/seedream-4.5',
    })
  })

  it('detects generated image extensions from bytes or declared media types', async () => {
    const { createGenerateImageTool } = await loadGenerateImageTool({
      OPENROUTER_API_KEY: 'openrouter-key',
    })
    const fetch = vi
      .fn<FetchMock>()
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ b64_json: Buffer.from('GIF89a').toString('base64') }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ b64_json: Buffer.from('RIFFxxxxWEBP').toString('base64') }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              b64_json: Buffer.from([1, 2]).toString('base64'),
              media_type: 'image/gif',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ b64_json: Buffer.from([1, 2, 3, 4]).toString('base64') }],
        }),
      )
    vi.stubGlobal('fetch', fetch)

    const tool = createGenerateImageTool('http://server.test')
    const urls: string[] = []
    for (const prompt of [
      'gif image prompt',
      'webp image prompt',
      'declared gif prompt',
      'fallback png prompt',
    ]) {
      const result = await tool.execute?.(
        { action: 'Create image', prompt },
        undefined as never,
      )
      if (!result || !('url' in result)) {
        throw new Error('Expected generate_image result with a URL')
      }
      urls.push(String(result.url))
    }

    expect(urls).toEqual([
      expect.stringMatching(/\.gif$/),
      expect.stringMatching(/\.webp$/),
      expect.stringMatching(/\.gif$/),
      expect.stringMatching(/\.png$/),
    ])
  })

  it('handles image API failures and empty responses', async () => {
    const { createGenerateImageTool } = await loadGenerateImageTool({
      OPENROUTER_API_KEY: 'openrouter-key',
    })
    const tool = createGenerateImageTool('http://server.test')

    vi.stubGlobal(
      'fetch',
      vi.fn<FetchMock>(async () => new Response('bad', { status: 502 })),
    )
    await expect(
      tool.execute?.(
        {
          action: 'Try image generation',
          prompt: 'A detailed product render in soft studio light',
        },
        undefined as never,
      ),
    ).resolves.toMatchObject({
      ok: false,
      reason: expect.stringContaining('OpenRouter image API error (502)'),
    })

    vi.stubGlobal(
      'fetch',
      vi.fn<FetchMock>(async () => jsonResponse({ data: [] })),
    )
    await expect(
      tool.execute?.(
        {
          action: 'Try image generation again',
          prompt: 'A detailed product render in soft studio light',
        },
        undefined as never,
      ),
    ).resolves.toMatchObject({
      ok: false,
      reason: 'OpenRouter returned no image data.',
    })
  })
})

describe('createScrapeTool', () => {
  it('returns a clear failure when Firecrawl is not configured', async () => {
    const { createScrapeTool } = await loadScrapeTool()
    const tool = createScrapeTool()

    const result = await tool.execute?.(
      {
        action: 'Scrape brand identity',
        url: 'https://example.test',
      },
      undefined as never,
    )

    expect(result).toMatchObject({
      branding: null,
      imageCount: 0,
      imageOcr: { imagesAnalyzed: 0, ok: false },
      ok: false,
      reason: expect.stringContaining('FIRECRAWL_API_KEY is not set'),
    })
  })

  it('scrapes brand data, normalizes image URLs, and OCRs unique images', async () => {
    const scrape = vi.fn<() => Promise<Record<string, unknown>>>(async () => ({
      branding: { colorScheme: 'dark', logo: '/logo.png' },
      images: ['/hero.png', 'data:image/png;base64,abc', '/hero.png'],
      links: ['https://example.test/pricing'],
      markdown:
        '![Logo](/logo.png)\n![CDN](https://cdn.example.test/card.webp)',
      metadata: {
        creditsUsed: 2,
        image: 'https://example.test/social.jpg',
        sourceURL: 'https://example.test/home',
        title: 'Example',
      },
    }))
    const ocrImages = vi.fn<
      (images: string[]) => Promise<{
        imagesAnalyzed: number
        ok: boolean
        text: string
        usage: null
      }>
    >(async (images) => ({
      imagesAnalyzed: images.length,
      ok: true,
      text: 'Image 1\nLogo',
      usage: null,
    }))
    const { createScrapeTool } = await loadScrapeTool({
      FIRECRAWL_API_KEY: 'firecrawl-key',
      ocrImages,
      scrape,
    })

    const tool = createScrapeTool()
    const result = await tool.execute?.(
      {
        action: 'Scrape brand identity',
        excludeTags: ['nav'],
        includeTags: ['main'],
        url: 'https://example.test/path',
        waitFor: 250,
      },
      undefined as never,
    )

    expect(scrape).toHaveBeenCalledWith('https://example.test/path', {
      excludeTags: ['nav'],
      formats: ['markdown', 'links', 'images', 'branding'],
      includeTags: ['main'],
      onlyMainContent: true,
      waitFor: 250,
    })
    expect(ocrImages).toHaveBeenCalledWith(
      [
        'https://example.test/hero.png',
        'https://example.test/logo.png',
        'https://cdn.example.test/card.webp',
        'https://example.test/social.jpg',
      ],
      undefined,
      'z-ai/glm-5v-turbo',
    )
    expect(result).toMatchObject({
      branding: { colorScheme: 'dark' },
      charCount: expect.any(Number),
      creditsUsed: 2,
      imageCount: 4,
      linkCount: 1,
      ok: true,
      title: 'Example',
      url: 'https://example.test/home',
    })
  })

  it('logs scrape OCR to vision-messages.json when projectId/turnId are set', async () => {
    const scrape = vi.fn<() => Promise<Record<string, unknown>>>(async () => ({
      images: ['/hero.png'],
      links: [],
      markdown: '',
      metadata: { title: 'X' },
    }))
    const ocrImages = vi.fn<
      (images: string[]) => Promise<{
        cost: number
        imagesAnalyzed: number
        ok: boolean
        text: string
        usage: null
      }>
    >(async (images) => ({
      cost: 0.002,
      imagesAnalyzed: images.length,
      ok: true,
      text: 'a hero shot',
      usage: null,
    }))
    const appendVisionMessage =
      vi.fn<(id: string, entry: unknown) => Promise<void>>()
    const { createScrapeTool } = await loadScrapeTool({
      appendVisionMessage,
      FIRECRAWL_API_KEY: 'firecrawl-key',
      ocrImages,
      scrape,
    })

    const tool = createScrapeTool({ projectId: 'proj-1', turnId: 'turn-1' })
    await tool.execute?.(
      { action: 'Scrape brand', url: 'https://example.test' },
      undefined as never,
    )

    expect(appendVisionMessage).toHaveBeenCalledWith(
      'proj-1',
      expect.objectContaining({
        imagesAnalyzed: 1,
        model: 'z-ai/glm-5v-turbo',
        ok: true,
        source: 'scrape',
        text: 'a hero shot',
        turnId: 'turn-1',
      }),
    )
  })

  it('does not log scrape OCR when projectId/turnId are absent', async () => {
    const scrape = vi.fn<() => Promise<Record<string, unknown>>>(async () => ({
      images: ['/hero.png'],
      links: [],
      markdown: '',
      metadata: {},
    }))
    const ocrImages = vi.fn<
      () => Promise<{
        imagesAnalyzed: number
        ok: boolean
        text: string
        usage: null
      }>
    >(async () => ({
      imagesAnalyzed: 1,
      ok: true,
      text: 'x',
      usage: null,
    }))
    const appendVisionMessage =
      vi.fn<(id: string, entry: unknown) => Promise<void>>()
    const { createScrapeTool } = await loadScrapeTool({
      appendVisionMessage,
      FIRECRAWL_API_KEY: 'firecrawl-key',
      ocrImages,
      scrape,
    })

    await createScrapeTool().execute?.(
      { action: 'Scrape brand', url: 'https://example.test' },
      undefined as never,
    )

    expect(appendVisionMessage).not.toHaveBeenCalled()
  })
})

describe('createScreenshotTool', () => {
  it('reports unavailable and failed browser capture paths', async () => {
    const unavailable = createScreenshotTool()
    await expect(
      unavailable.execute?.(
        {
          action: 'Check desktop hero layout',
          selector: '#hero',
          viewportSize: 'desktop',
        },
        undefined as never,
      ),
    ).resolves.toMatchObject({
      height: null,
      ok: false,
      reason: 'Browser screenshot capture is unavailable in this runtime.',
      width: null,
    })

    const failing = createScreenshotTool(async () => {
      throw new Error('browser closed')
    })
    await expect(
      failing.execute?.(
        {
          action: 'Check mobile hero layout',
          selector: '#hero',
          viewportSize: 'mobile',
        },
        undefined as never,
      ),
    ).resolves.toMatchObject({
      imageOcr: { reason: 'browser closed' },
      ok: false,
      reason: 'browser closed',
    })
  })

  it('requests a screenshot and OCRs the returned image', async () => {
    vi.resetModules()
    const ocrImageInputs = vi.fn<
      () => Promise<{
        cost: number
        imagesAnalyzed: number
        ok: boolean
        text: string
        usage: null
      }>
    >(async () => ({
      cost: 0.004,
      imagesAnalyzed: 1,
      ok: true,
      text: 'Image 1\nHero headline visible',
      usage: null,
    }))
    vi.doMock('../lib/image-ocr.ts', () => ({ ocrImageInputs }))
    const { createScreenshotTool: loadTool } = await import('./screenshot.ts')
    const requestScreenshot = vi.fn<
      () => Promise<{
        dataUrl: string
        height: number
        mediaType: 'image/png'
        width: number
      }>
    >(async () => ({
      dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      height: 600,
      mediaType: 'image/png' as const,
      width: 800,
    }))

    const tool = loadTool(requestScreenshot)
    const result = await tool.execute?.(
      {
        action: 'Check hero spacing and CTA contrast',
        selector: '#hero',
        viewportSize: 'tablet',
      },
      undefined as never,
    )

    expect(requestScreenshot).toHaveBeenCalledWith({
      selector: '#hero',
      timeoutMs: 25_000,
      viewportSize: 'tablet',
    })
    expect(ocrImageInputs).toHaveBeenCalledWith(
      [
        {
          dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
          sourceLabel: 'browser screenshot 800×600 of #hero at tablet viewport',
        },
      ],
      expect.stringContaining('Target selector: #hero'),
      'z-ai/glm-5v-turbo',
    )
    expect(result).toMatchObject({
      height: 600,
      imageOcr: { cost: 0.004, ok: true },
      mediaType: 'image/png',
      ok: true,
      text: 'Image 1\nHero headline visible',
      width: 800,
    })
  })
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  })
}

async function loadGenerateImageTool(env: Record<string, string> = {}) {
  vi.resetModules()
  vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
  vi.stubEnv('OPENROUTER_API_KEY', '')
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value)
  return import('./generate-image.ts')
}

async function loadScrapeTool({
  appendVisionMessage = vi.fn<(id: string, entry: unknown) => Promise<void>>(),
  FIRECRAWL_API_KEY,
  ocrImages = vi.fn<() => Promise<unknown>>(),
  scrape = vi.fn<() => Promise<unknown>>(),
}: {
  appendVisionMessage?: ReturnType<typeof vi.fn>
  FIRECRAWL_API_KEY?: string
  ocrImages?: ReturnType<typeof vi.fn>
  scrape?: ReturnType<typeof vi.fn>
} = {}) {
  vi.resetModules()
  vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
  vi.stubEnv('FIRECRAWL_API_KEY', '')
  if (FIRECRAWL_API_KEY) vi.stubEnv('FIRECRAWL_API_KEY', FIRECRAWL_API_KEY)
  vi.doMock('firecrawl', () => ({
    Firecrawl: class {
      scrape = scrape
    },
  }))
  vi.doMock('../lib/image-ocr.ts', () => ({ ocrImages }))
  vi.doMock('../lib/project-store.ts', () => ({ appendVisionMessage }))
  return import('./scrape.ts')
}
