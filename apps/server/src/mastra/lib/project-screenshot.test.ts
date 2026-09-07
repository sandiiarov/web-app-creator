import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createOperationScope,
  OperationDrainError,
} from '../../providers/operation-scope.ts'
import {
  PROJECT_SCREENSHOT_VIEWPORTS,
  ProjectScreenshotCaptureError,
  buildStaticElementMap,
  captureProjectSelectors,
  injectCaptureAssets,
  publishHtmlEphemeral,
  scrapeFullPageScreenshot,
  type ProjectScreenshotDependencies,
  type ScrapedScreenshot,
} from './project-screenshot.ts'

const API_KEY = 'fc-test-key'

function createDeps(
  overrides: Partial<ProjectScreenshotDependencies> = {},
): ProjectScreenshotDependencies & {
  persisted: Array<{ dataUrl: string; mediaType: string }>
  publishCalls: string[]
  scrapeCalls: Array<{
    url: string
    viewport: { height: number; width: number }
  }>
} {
  const state = {
    persisted: [] as Array<{ dataUrl: string; mediaType: string }>,
    publishCalls: [] as string[],
    scrapeCalls: [] as Array<{
      url: string
      viewport: { height: number; width: number }
    }>,
  }
  return {
    ...state,
    firecrawl: { apiKey: API_KEY },
    inlineProjectImages: async (_projectId, html) => html,
    persistScreenshot: (_projectId, _requestId, dataUrl, mediaType) => {
      state.persisted.push({ dataUrl, mediaType })
      return { ext: '.png', path: `/api/projects/p1/screenshots/001-x.png` }
    },
    publishHtml: async (html) => {
      state.publishCalls.push(html)
      return 'https://litter.example.test/abc.html'
    },
    scrapeScreenshot: async (input) => {
      state.scrapeCalls.push({ url: input.url, viewport: input.viewport })
      return fakeScraped()
    },
    ...overrides,
  }
}

/** Minimal valid PNG (8x6) whose IHDR the dimension reader can parse. */
function fakePng(width = 8, height = 6): Buffer {
  const buf = Buffer.alloc(33)
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  buf.writeUInt32BE(13, 8) // IHDR length
  buf.write('IHDR', 12)
  buf.writeUInt32BE(width, 16)
  buf.writeUInt32BE(height, 20)
  return buf
}

function fakeScraped(
  overrides: Partial<ScrapedScreenshot> = {},
): ScrapedScreenshot {
  return {
    creditsUsed: 2,
    dataUrl: `data:image/png;base64,${fakePng().toString('base64')}`,
    height: 6,
    width: 8,
    ...overrides,
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('captureProjectSelectors config validation', () => {
  it('throws when the Firecrawl API key is missing', async () => {
    await expect(
      captureProjectSelectors(
        { html: '<p>hi</p>', projectId: 'p1', selectors: ['body'] },
        createDeps({ firecrawl: {} }),
      ),
    ).rejects.toThrow('Firecrawl is not configured')
  })

  it('throws when the API key is whitespace-only', async () => {
    await expect(
      captureProjectSelectors(
        { html: '<p>hi</p>', projectId: 'p1', selectors: ['body'] },
        createDeps({ firecrawl: { apiKey: ' \t ' } }),
      ),
    ).rejects.toThrow('Firecrawl is not configured')
  })

  it('throws when no selectors are provided', async () => {
    await expect(
      captureProjectSelectors(
        { html: '<p>hi</p>', projectId: 'p1', selectors: [] },
        createDeps({ firecrawl: { apiKey: 't' } }),
      ),
    ).rejects.toThrow('at least one selector')
  })

  it('throws for a non-positive timeout', async () => {
    await expect(
      captureProjectSelectors(
        {
          html: '<p>hi</p>',
          projectId: 'p1',
          selectors: ['body'],
          timeoutMs: 0,
        },
        createDeps({ firecrawl: { apiKey: 't' } }),
      ),
    ).rejects.toThrow('timeout is invalid')
  })
})

describe('captureProjectSelectors end-to-end (mocked publish + scrape)', () => {
  it('publishes once and scrapes three viewports in order', async () => {
    const deps = createDeps()

    const result = await captureProjectSelectors(
      {
        html: '<html><head></head><body><p>Hello</p><a href="/x">Go</a></body></html>',
        projectId: 'p1',
        selectors: ['body'],
      },
      deps,
    )

    expect(deps.publishCalls).toHaveLength(1)
    expect(deps.scrapeCalls).toHaveLength(3)
    expect(deps.scrapeCalls.map((call) => call.viewport)).toEqual(
      PROJECT_SCREENSHOT_VIEWPORTS.map((vp) => ({
        height: vp.height,
        width: vp.width,
      })),
    )
    // Each viewport scrape is cache-busted by its own query param.
    expect(deps.scrapeCalls.map((call) => call.url)).toEqual([
      'https://litter.example.test/abc.html?agent-viewport=mobile&retry=0',
      'https://litter.example.test/abc.html?agent-viewport=tablet&retry=0',
      'https://litter.example.test/abc.html?agent-viewport=desktop&retry=0',
    ])

    expect(result).toHaveLength(1)
    expect(result[0]!.selector).toBe('body')
    expect(result[0]!.captures.map((capture) => capture.viewport)).toEqual([
      'mobile',
      'tablet',
      'desktop',
    ])
    for (const capture of result[0]!.captures) {
      expect(capture.mediaType).toBe('image/png')
      expect(capture.imageUrl).toBe('/api/projects/p1/screenshots/001-x.png')
      expect(capture.elementMap).toContain('link "Go"')
    }
    expect(deps.persisted).toHaveLength(3)
    expect(deps.persisted[0]!.mediaType).toBe('image/png')
  })

  it('shares the same three captures across multiple selectors', async () => {
    const deps = createDeps()
    const result = await captureProjectSelectors(
      {
        html: '<body><p>Hi</p></body>',
        projectId: 'p1',
        selectors: ['body', '#hero'],
      },
      deps,
    )
    expect(result).toHaveLength(2)
    expect(deps.publishCalls).toHaveLength(1)
    expect(deps.scrapeCalls).toHaveLength(3)
    expect(result[0]!.captures).toBe(result[1]!.captures)
  })

  it('reports the summed scrape credits once', async () => {
    const onFirecrawlCredits = vi.fn<(credits: number) => void>()
    const deps = createDeps({ onFirecrawlCredits })
    await captureProjectSelectors(
      { html: '<p>hi</p>', projectId: 'p1', selectors: ['body'] },
      deps,
    )
    expect(onFirecrawlCredits).toHaveBeenCalledTimes(1)
    expect(onFirecrawlCredits).toHaveBeenCalledWith(6)
  })

  it('retains every parsed viewport charge when one viewport fails', async () => {
    const operations = createOperationScope()
    const deps = createDeps({
      scrapeScreenshot: async (input) => {
        input.operation?.reportUsage({
          amount: 2,
          category: 'firecrawl',
          count: 1,
          reportId: 'response',
          source: 'screenshot',
          unit: 'credits',
        })
        if (input.viewport.width === 390) throw new Error('mobile failed')
        return fakeScraped()
      },
    })

    await expect(
      captureProjectSelectors(
        {
          html: '<p>hi</p>',
          operations,
          projectId: 'p1',
          selectors: ['body'],
        },
        deps,
      ),
    ).rejects.toThrow('Firecrawl screenshot capture failed.')
    await expect(operations.drain()).resolves.toEqual({ ok: true })
    expect(operations.getUsageReports()).toHaveLength(3)
    expect(
      operations
        .getUsageReports()
        .reduce((total, report) => total + report.amount, 0),
    ).toBe(6)
  })

  it('fences a late screenshot write after a sibling failure', async () => {
    const lateDesktop = deferred<ScrapedScreenshot>()
    const operations = createOperationScope({
      drainGraceMs: 5,
      operationTimeoutMs: 1_000,
    })
    const deps = createDeps({
      scrapeScreenshot: async (input) => {
        if (input.viewport.width === 390) throw new Error('mobile failed')
        if (input.viewport.width === 1440) return lateDesktop.promise
        return fakeScraped()
      },
    })

    const startedAt = Date.now()
    await expect(
      captureProjectSelectors(
        {
          html: '<p>hi</p>',
          operations,
          projectId: 'p1',
          selectors: ['body'],
        },
        deps,
      ),
    ).rejects.toBeInstanceOf(OperationDrainError)
    expect(Date.now() - startedAt).toBeLessThan(500)
    await expect(operations.drain()).resolves.toMatchObject({
      ok: false,
      reason: 'drain_failed',
    })
    const writesBeforeLateSettlement = deps.persisted.length
    lateDesktop.resolve(fakeScraped())
    await lateDesktop.promise
    await new Promise((resolve) => setImmediate(resolve))
    expect(deps.persisted).toHaveLength(writesBeforeLateSettlement)
  })

  it('skips the credit callback when scrapes report no credits', async () => {
    const onFirecrawlCredits = vi.fn<(credits: number) => void>()
    const deps = createDeps({
      onFirecrawlCredits,
      scrapeScreenshot: async () => fakeScraped({ creditsUsed: undefined }),
    })
    await captureProjectSelectors(
      { html: '<p>hi</p>', projectId: 'p1', selectors: ['body'] },
      deps,
    )
    expect(onFirecrawlCredits).not.toHaveBeenCalled()
  })

  it('re-scrapes the mobile viewport once when it is shorter than desktop', async () => {
    const heights: Record<string, number[]> = {
      desktop: [3000],
      mobile: [1200, 3600],
      tablet: [3200],
    }
    const deps = createDeps({
      scrapeScreenshot: async (input) => {
        deps.scrapeCalls.push({ url: input.url, viewport: input.viewport })
        const name =
          input.viewport.width === 390
            ? 'mobile'
            : input.viewport.width === 768
              ? 'tablet'
              : 'desktop'
        const height = heights[name]!.shift() ?? 3000
        return fakeScraped({ height })
      },
    })

    const result = await captureProjectSelectors(
      { html: '<p>hi</p>', projectId: 'p1', selectors: ['body'] },
      deps,
    )

    expect(deps.scrapeCalls).toHaveLength(4)
    expect(deps.scrapeCalls[3]!.url).toContain('agent-viewport=mobile&retry=1')
    const mobile = result[0]!.captures.find(
      (capture) => capture.viewport === 'mobile',
    )
    expect(mobile!.height).toBe(3600)
  })

  it('does not re-scrape when the mobile capture reaches desktop height', async () => {
    const deps = createDeps({
      scrapeScreenshot: async (input) => {
        deps.scrapeCalls.push({ url: input.url, viewport: input.viewport })
        return fakeScraped({ height: 3000 })
      },
    })

    await captureProjectSelectors(
      { html: '<p>hi</p>', projectId: 'p1', selectors: ['body'] },
      deps,
    )

    expect(deps.scrapeCalls).toHaveLength(3)
  })

  it('retains the failed mobile retry charge', async () => {
    const operations = createOperationScope()
    const deps = createDeps({
      scrapeScreenshot: async (input) => {
        input.operation?.reportUsage({
          amount: input.url.includes('retry=1') ? 5 : 2,
          category: 'firecrawl',
          count: 1,
          reportId: 'response',
          source: 'screenshot',
          unit: 'credits',
        })
        if (input.url.includes('retry=1')) throw new Error('retry failed')
        return fakeScraped({
          height: input.viewport.width === 390 ? 1200 : 3000,
        })
      },
    })

    await expect(
      captureProjectSelectors(
        {
          html: '<p>hi</p>',
          operations,
          projectId: 'p1',
          selectors: ['body'],
        },
        deps,
      ),
    ).rejects.toThrow('Firecrawl screenshot capture failed.')
    await expect(operations.drain()).resolves.toEqual({ ok: true })
    expect(
      operations
        .getUsageReports()
        .reduce((total, report) => total + report.amount, 0),
    ).toBe(11)
  })

  it('propagates publish failures as capture errors', async () => {
    const deps = createDeps({
      publishHtml: async () => {
        throw new ProjectScreenshotCaptureError('HTML publish failed (503).')
      },
    })
    await expect(
      captureProjectSelectors(
        { html: '<p>hi</p>', projectId: 'p1', selectors: ['body'] },
        deps,
      ),
    ).rejects.toThrow('HTML publish failed (503).')
  })

  it('preserves a typed failed-drain error from owned provider work', async () => {
    const failure = new OperationDrainError({
      ok: false,
      pendingOperationIds: ['publish:2'],
      reason: 'drain_failed',
    })
    const deps = createDeps({
      publishHtml: async () => {
        throw failure
      },
    })

    await expect(
      captureProjectSelectors(
        { html: '<p>hi</p>', projectId: 'p1', selectors: ['body'] },
        deps,
      ),
    ).rejects.toBe(failure)
  })

  it('normalizes aborts during scrape', async () => {
    const controller = new AbortController()
    const deps = createDeps({
      scrapeScreenshot: async () => {
        controller.abort()
        throw new Error('aborted')
      },
    })
    await expect(
      captureProjectSelectors(
        {
          html: '<p>hi</p>',
          projectId: 'p1',
          selectors: ['body'],
          signal: controller.signal,
        },
        deps,
      ),
    ).rejects.toThrow('Screenshot capture was stopped.')
  })

  it('normalizes rate-limit errors', async () => {
    const deps = createDeps({
      scrapeScreenshot: async () => {
        throw new Error('HTTP 429 too many requests')
      },
    })
    await expect(
      captureProjectSelectors(
        { html: '<p>hi</p>', projectId: 'p1', selectors: ['body'] },
        deps,
      ),
    ).rejects.toThrow('rate limited')
  })
})

describe('injectCaptureAssets', () => {
  it('strips page scripts and injects the badge script + freeze CSS before </head>', () => {
    const out = injectCaptureAssets(
      '<html><head><title>t</title></head><body><script>alert(1)</script><p>x</p></body></html>',
    )
    expect(out).not.toContain('alert(1)')
    expect(out).toContain('data-agent-badge')
    expect(out).toContain('animation-duration:0s')
    expect(out.indexOf('data-agent-badge')).toBeLessThan(out.indexOf('</head>'))
  })

  it('appends assets when no head/body close tag exists', () => {
    const out = injectCaptureAssets('<p>x</p>')
    expect(out.endsWith('</script>')).toBe(true)
  })
})

describe('buildStaticElementMap', () => {
  it('lists interactive elements in document order with role, name, and state', () => {
    const map = buildStaticElementMap(
      '<nav><a href="/a">Home</a><button disabled>Send</button></nav>' +
        '<form><input type="email" placeholder="Email" required>' +
        '<input type="hidden" name="h">' +
        '<select aria-label="Plan"></select></form>',
    )
    const rows = map.split('\n')
    expect(rows).toHaveLength(4)
    expect(rows[0]).toBe('0 link "Home" state=enabled')
    expect(rows[1]).toBe('1 button "Send" state=disabled')
    expect(rows[2]).toBe('2 textbox "Email" state=required')
    expect(rows[3]).toBe('3 combobox "Plan" state=enabled')
  })

  it('includes role/tabindex/contenteditable hosts and skips plain elements', () => {
    const map = buildStaticElementMap(
      '<div><span>text</span><div role="button" aria-label="Open"></div>' +
        '<p contenteditable="true">edit</p><a>no href</a></div>',
    )
    const rows = map.split('\n')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toBe('0 button "Open" state=enabled')
    expect(rows[1]).toBe('1 p "edit" state=enabled')
  })
})

describe('publishHtmlEphemeral', () => {
  it('posts the HTML as a multipart upload and returns the hosted URL', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response('https://litter.example.test/ok.html'),
    )
    vi.stubGlobal('fetch', fetchMock)

    const url = await publishHtmlEphemeral('<p>hello</p>', undefined, {
      retryDelayMs: 1,
    })
    expect(url).toBe('https://litter.example.test/ok.html')
    const [requestUrl, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(String(requestUrl)).toContain('litterbox')
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
  })

  it('rejects a non-URL response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => new Response('uploads disabled')),
    )
    await expect(
      publishHtmlEphemeral('<p>x</p>', undefined, { retryDelayMs: 1 }),
    ).rejects.toThrow('unexpected response')
  })

  it('retries through transient 500 rounds until the host recovers', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('err', { status: 500 }))
      .mockResolvedValueOnce(new Response('err', { status: 500 }))
      .mockResolvedValueOnce(
        new Response('https://litter.example.test/ok.html'),
      )
    vi.stubGlobal('fetch', fetchMock)

    const url = await publishHtmlEphemeral('<p>hello</p>', undefined, {
      retryDelayMs: 1,
    })
    expect(url).toBe('https://litter.example.test/ok.html')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it(
    'surfaces the publish failure after exhausting retry rounds',
    { timeout: 25_000 },
    async () => {
      vi.useFakeTimers()
      const fetchMock = vi.fn<typeof fetch>(
        async () => new Response('err', { status: 500 }),
      )
      vi.stubGlobal('fetch', fetchMock)

      const published = publishHtmlEphemeral('<p>x</p>', undefined, {
        retryDelayMs: 1,
      })
      const timers = vi.runAllTimersAsync()
      await expect(published).rejects.toThrow(/HTML publish failed.*HTTP 500/)
      await timers
      // 3 rounds × 3 safe transport attempts each.
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(9)
    },
  )
})

describe('scrapeFullPageScreenshot', () => {
  function stubScrapeSequence() {
    const png = fakePng(390, 1200)
    const scrapeResponse = new Response(
      JSON.stringify({
        data: {
          metadata: { creditsUsed: 3 },
          screenshot: 'https://storage.example.test/shot.png',
        },
        success: true,
      }),
      { headers: { 'Content-Type': 'application/json' }, status: 200 },
    )
    const imageResponse = new Response(png, { status: 200 })
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(scrapeResponse)
      .mockResolvedValueOnce(imageResponse)
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('requests a full-page screenshot at the given viewport and downloads it', async () => {
    const fetchMock = stubScrapeSequence()
    const result = await scrapeFullPageScreenshot({
      apiKey: API_KEY,
      timeoutMs: 45_000,
      url: 'https://litter.example.test/abc.html?agent-viewport=mobile',
      viewport: { height: 844, width: 390 },
    })

    const [scrapeUrl, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(String(scrapeUrl)).toBe('https://api.firecrawl.dev/v2/scrape')
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${API_KEY}`,
    )
    const body = JSON.parse(String(init.body))
    expect(body.formats).toEqual([
      {
        fullPage: true,
        type: 'screenshot',
        viewport: { height: 844, width: 390 },
      },
    ])
    expect(body.maxAge).toBe(0)

    expect(result.creditsUsed).toBe(3)
    expect(result.width).toBe(390)
    expect(result.height).toBe(1200)
    expect(result.dataUrl.startsWith('data:image/png;base64,')).toBe(true)
  })

  it('surfaces 402 as payment required', async () => {
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 402 }))
    await expect(
      scrapeFullPageScreenshot({
        apiKey: API_KEY,
        timeoutMs: 45_000,
        url: 'https://x.test',
        viewport: { height: 844, width: 390 },
      }),
    ).rejects.toThrow('payment required')
  })

  it('rejects when no screenshot URL comes back', async () => {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(JSON.stringify({ data: {}, success: true }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        }),
    )
    await expect(
      scrapeFullPageScreenshot({
        apiKey: API_KEY,
        timeoutMs: 45_000,
        url: 'https://x.test',
        viewport: { height: 844, width: 390 },
      }),
    ).rejects.toThrow('no screenshot')
  })

  it('retains Firecrawl credits when the screenshot download fails', async () => {
    const operations = createOperationScope()
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              metadata: { creditsUsed: 4 },
              screenshot: 'https://storage.example.test/missing.png',
            },
            success: true,
          }),
          { headers: { 'Content-Type': 'application/json' }, status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response('missing', { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      scrapeFullPageScreenshot({
        apiKey: API_KEY,
        operations,
        timeoutMs: 45_000,
        url: 'https://x.test',
        viewport: { height: 844, width: 390 },
      }),
    ).rejects.toThrow('Firecrawl screenshot download failed.')
    await expect(operations.drain()).resolves.toEqual({ ok: true })
    expect(operations.getUsageReports()).toEqual([
      expect.objectContaining({
        amount: 4,
        category: 'firecrawl',
      }),
    ])
  })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}
