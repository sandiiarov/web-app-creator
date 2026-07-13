import { randomUUID } from 'node:crypto'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  PROJECT_SCREENSHOT_VIEWPORTS,
  ProjectScreenshotCaptureError,
  captureProjectSelectors,
  cloudflareBrowserRunEndpoint,
  sanitizeProjectHtmlForCapture,
  screenshotOutputDimensions,
  screenshotScale,
  type ProjectScreenshotDependencies,
} from './project-screenshot.ts'

const TARGET_HEIGHT = 180
const TARGET_WIDTH = 320

afterEach(() => {
  vi.restoreAllMocks()
})

describe('cloudflareBrowserRunEndpoint', () => {
  it('builds the authenticated CDP WebSocket without embedding the token', () => {
    const endpoint = cloudflareBrowserRunEndpoint('account-123')
    expect(endpoint).toBe(
      'wss://api.cloudflare.com/client/v4/accounts/account-123/browser-rendering/devtools/browser?keep_alive=15000',
    )
    expect(endpoint).not.toContain('Bearer')
  })
})

describe('screenshotScale', () => {
  it('defaults to half scale for small targets', () => {
    expect(screenshotScale(320, 180)).toBe(0.5)
  })

  it('caps scale so the padded output never exceeds 4096', () => {
    const scale = screenshotScale(8000, 100)
    const dims = screenshotOutputDimensions(8000, 100, scale)
    expect(dims.width).toBeLessThanOrEqual(4096)
    expect(dims.height).toBeLessThanOrEqual(4096)
  })

  it('throws for invalid dimensions', () => {
    expect(() => screenshotScale(0, 100)).toThrow(ProjectScreenshotCaptureError)
    expect(() => screenshotScale(-1, 100)).toThrow(
      ProjectScreenshotCaptureError,
    )
    expect(() => screenshotScale(NaN, 100)).toThrow(
      ProjectScreenshotCaptureError,
    )
  })
})

describe('screenshotOutputDimensions', () => {
  it('produces half-scale dimensions with symmetric padding', () => {
    const scale = 0.5
    const dims = screenshotOutputDimensions(320, 180, scale)
    // (320 + 32) * 0.5 = 176, (180 + 32) * 0.5 = 106
    expect(dims).toEqual({ height: 106, width: 176 })
  })
})

describe('sanitizeProjectHtmlForCapture', () => {
  it('strips script blocks, self-closing scripts, base tags, and inline handlers', () => {
    const dirty = `<base href="http://evil.test"><div onclick="alert(1)"><script>alert(2)</script><script src="x.js"/><button onmouseover="m()">Go</button></div>`
    const clean = sanitizeProjectHtmlForCapture(dirty)
    expect(clean).not.toContain('<script')
    expect(clean).not.toContain('<base')
    expect(clean).not.toContain('onclick')
    expect(clean).not.toContain('onmouseover')
    expect(clean).toContain('<button>Go</button>')
    expect(clean).toContain('<div>')
  })
})

describe('captureProjectSelectors config validation', () => {
  it('throws when Cloudflare credentials are missing', async () => {
    await expect(
      captureProjectSelectors(
        { html: '<p>hi</p>', projectId: 'p1', selectors: ['body'] },
        { cloudflare: {} },
      ),
    ).rejects.toThrow('Cloudflare Browser Run is not configured')
  })

  it('throws when credentials are whitespace-only', async () => {
    await expect(
      captureProjectSelectors(
        { html: '<p>hi</p>', projectId: 'p1', selectors: ['body'] },
        { cloudflare: { accountId: '  ', apiToken: '\t' } },
      ),
    ).rejects.toThrow('Cloudflare Browser Run is not configured')
  })

  it('throws when no selectors are provided', async () => {
    await expect(
      captureProjectSelectors(
        { html: '<p>hi</p>', projectId: 'p1', selectors: [] },
        { cloudflare: { accountId: 'a', apiToken: 't' } },
      ),
    ).rejects.toThrow('at least one selector')
  })
})

describe('captureProjectSelectors end-to-end (mocked browser)', () => {
  it('acquires one browser and captures three viewports per selector', async () => {
    const fake = createFakeBrowser()
    const deps = createDeps(fake)

    const result = await captureProjectSelectors(
      {
        html: '<body><p>Hello</p></body>',
        projectId: 'p1',
        selectors: ['body'],
      },
      deps,
    )

    expect(result).toHaveLength(1)
    expect(result[0]!.selector).toBe('body')
    expect(result[0]!.captures).toHaveLength(3)
    expect(result[0]!.captures.map((c) => c.viewport)).toEqual([
      'mobile',
      'tablet',
      'desktop',
    ])

    // Exactly one CDP connection for the whole batch.
    expect(fake.connectCalls).toHaveLength(1)
    expect(fake.connectCalls[0]).toMatchObject({
      authHeader: 'Bearer test-token',
      endpoint: expect.stringContaining('/accounts/test-account/'),
    })

    // Three viewports were applied in the correct order.
    expect(
      fake.page.setViewportSizeCalls.map((v) => [v.width, v.height]),
    ).toEqual(PROJECT_SCREENSHOT_VIEWPORTS.map((vp) => [vp.width, vp.height]))

    // Each viewport loaded the HTML and captured the selector.
    expect(fake.page.setContentCalls).toHaveLength(3)
    expect(fake.cdp.screenshotCalls).toBe(3)

    // Network isolation was installed once.
    expect(fake.context.routeCalls).toBeGreaterThanOrEqual(1)
    expect(fake.context.routeWebSocketCalls).toBe(1)

    // Context had JavaScript and service workers disabled.
    expect(fake.context.options).toMatchObject({
      javaScriptEnabled: false,
      serviceWorkers: 'block',
    })

    // All captures are persisted with safe URLs.
    for (const capture of result[0]!.captures) {
      expect(capture.imageUrl).toMatch(/^\/api\/projects\/p1\/screenshots\//)
      expect(capture.dataUrl).toMatch(/^data:image\/jpeg;base64,/)
      expect(capture.mediaType).toBe('image/jpeg')
    }

    // Everything was closed.
    expect(fake.context.closed).toBe(true)
    expect(fake.browser.closed).toBe(true)
  })

  it('captures multiple selectors in one browser session', async () => {
    const fake = createFakeBrowser()
    const deps = createDeps(fake)

    const result = await captureProjectSelectors(
      {
        html: '<body><div class="hero"></div><div class="cta"></div></body>',
        projectId: 'p1',
        selectors: ['.hero', '.cta'],
      },
      deps,
    )

    expect(result).toHaveLength(2)
    expect(result[0]!.captures).toHaveLength(3)
    expect(result[1]!.captures).toHaveLength(3)
    expect(fake.connectCalls).toHaveLength(1)
    // 2 selectors × 3 viewports = 6 screenshots.
    expect(fake.cdp.screenshotCalls).toBe(6)
  })

  it('inlines project images before sending HTML to the browser', async () => {
    const fake = createFakeBrowser()
    const inlineProjectImages = vi.fn<
      (id: string, html: string) => Promise<string>
    >(async (_id, html) => html)
    const deps = createDeps(fake, { inlineProjectImages })

    await captureProjectSelectors(
      { html: '<body></body>', projectId: 'p1', selectors: ['body'] },
      deps,
    )

    expect(inlineProjectImages).toHaveBeenCalledWith('p1', '<body></body>')
  })

  it('sanitizes script tags from the HTML before setContent', async () => {
    const fake = createFakeBrowser()
    const deps = createDeps(fake)

    await captureProjectSelectors(
      {
        html: '<body><script>alert(1)</script></body>',
        projectId: 'p1',
        selectors: ['body'],
      },
      deps,
    )

    expect(fake.page.setContentCalls[0]).not.toContain('<script')
  })

  it('aborts capture when the signal is already aborted', async () => {
    const fake = createFakeBrowser()
    const deps = createDeps(fake)
    const controller = new AbortController()
    controller.abort()

    await expect(
      captureProjectSelectors(
        {
          html: '<body></body>',
          projectId: 'p1',
          selectors: ['body'],
          signal: controller.signal,
        },
        deps,
      ),
    ).rejects.toThrow('stopped')
  })

  it('returns an actionable error for a missing selector', async () => {
    const fake = createFakeBrowser({
      inspectResult: { error: 'No element matches selector ".missing".' },
    })
    const deps = createDeps(fake)

    await expect(
      captureProjectSelectors(
        { html: '<body></body>', projectId: 'p1', selectors: ['.missing'] },
        deps,
      ),
    ).rejects.toThrow('No element matches selector ".missing"')

    // Browser is still cleaned up after a selector error.
    expect(fake.browser.closed).toBe(true)
  })

  it('normalizes a rate-limit provider error', async () => {
    const fake = createFakeBrowser({
      connectError: new Error('HTTP 429 Too Many Requests'),
    })
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => undefined)
    const deps = createDeps(fake, { sleep })

    await expect(
      captureProjectSelectors(
        { html: '<body></body>', projectId: 'p1', selectors: ['body'] },
        deps,
      ),
    ).rejects.toThrow('rate limited')

    // Rate-limit errors use a longer retry delay (not the short transient one).
    expect(sleep).toHaveBeenCalledTimes(1)
    expect(sleep.mock.calls[0]![0]).toBeGreaterThanOrEqual(1000)
  })

  it('does not retry and gives a clear message for the daily browser-time limit', async () => {
    const fake = createFakeBrowser({
      connectError: new Error(
        'Unable to create new browser: code: 429: message: Browser time limit exceeded for today',
      ),
    })
    const sleep = vi.fn<() => Promise<void>>(async () => undefined)
    const deps = createDeps(fake, { sleep })

    await expect(
      captureProjectSelectors(
        { html: '<body></body>', projectId: 'p1', selectors: ['body'] },
        deps,
      ),
    ).rejects.toThrow('daily browser-time limit')

    // Daily limit is a hard stop — no retry.
    expect(fake.connectCalls).toHaveLength(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('normalizes an authentication provider error', async () => {
    const fake = createFakeBrowser({
      connectError: new Error('HTTP 401 Unauthorized'),
    })
    const deps = createDeps(fake)

    await expect(
      captureProjectSelectors(
        { html: '<body></body>', projectId: 'p1', selectors: ['body'] },
        deps,
      ),
    ).rejects.toThrow('authentication failed')
  })

  it('retries one transient connection failure before failing', async () => {
    let calls = 0
    const fake = createFakeBrowser({
      connectErrorFactory: () => {
        calls += 1
        return calls === 1 ? new Error('socket hang up') : undefined
      },
    })
    const sleep = vi.fn<() => Promise<void>>(async () => undefined)
    const deps = createDeps(fake, { sleep })

    const result = await captureProjectSelectors(
      { html: '<body></body>', projectId: 'p1', selectors: ['body'] },
      deps,
    )

    expect(result[0]!.captures).toHaveLength(3)
    expect(fake.connectCalls).toHaveLength(2)
    expect(sleep).toHaveBeenCalledTimes(1)
  })

  it('does not place credentials in the endpoint URL', async () => {
    const fake = createFakeBrowser()
    const deps = createDeps(fake)

    await captureProjectSelectors(
      { html: '<body></body>', projectId: 'p1', selectors: ['body'] },
      deps,
    )

    expect(fake.connectCalls[0]!.endpoint).not.toContain('test-token')
    expect(fake.connectCalls[0]!.authHeader).toBe('Bearer test-token')
  })
})

// ── test fakes ──────────────────────────────────────────────────

interface FakeBrowserOptions {
  connectError?: Error
  connectErrorFactory?: () => Error | undefined
  inspectResult?: { error: string } | { height: number; width: number }
}

function createDeps(
  fake: ReturnType<typeof createFakeBrowser>,
  overrides: Partial<ProjectScreenshotDependencies> = {},
): ProjectScreenshotDependencies {
  return {
    cloudflare: { accountId: 'test-account', apiToken: 'test-token' },
    connectOverCDP: fake.connector,
    inlineProjectImages: overrides.inlineProjectImages,
    now: overrides.now ?? (() => fake.currentTime),
    persistScreenshot:
      overrides.persistScreenshot ??
      ((projectId) => ({
        ext: '.jpg',
        path: `/api/projects/${projectId}/screenshots/001-${randomUUID()}.jpg`,
      })),
    sleep: overrides.sleep,
  }
}

function createFakeBrowser(options: FakeBrowserOptions = {}) {
  const state = {
    browser: {
      closed: false,
    },
    cdp: {
      screenshotCalls: 0,
    },
    connectCalls: [] as { authHeader: string; endpoint: string }[],
    context: {
      closed: false,
      options: null as null | Record<string, unknown>,
      routeCalls: 0,
      routeWebSocketCalls: 0,
    },
    currentTime: 1_000_000,
    page: {
      setContentCalls: [] as string[],
      setViewportSizeCalls: [] as { height: number; width: number }[],
    },
  }

  const connector = async (
    endpoint: string,
    opts: { headers: Record<string, string> },
  ) => {
    state.connectCalls.push({
      authHeader: opts.headers.Authorization ?? '',
      endpoint,
    })
    const error = options.connectErrorFactory?.() ?? options.connectError
    if (error) throw error

    const browser = {
      close: async () => {
        state.browser.closed = true
      },
      newContext: async (contextOptions: Record<string, unknown> = {}) => {
        state.context.options = contextOptions
        return {
          close: async () => {
            state.context.closed = true
          },
          newCDPSession: async () => ({
            close: async () => undefined,
            send: async (method: string, _params?: Record<string, unknown>) => {
              if (method === 'Page.captureScreenshot') {
                state.cdp.screenshotCalls += 1
                return { data: 'AAAA' }
              }
              return undefined
            },
          }),
          newPage: async () => ({
            close: async () => undefined,
            evaluate: async (script: string) => {
              return simulateEvaluate(script, options.inspectResult)
            },
            setContent: async (html: string) => {
              state.page.setContentCalls.push(html)
            },
            setViewportSize: async (size: {
              height: number
              width: number
            }) => {
              state.page.setViewportSizeCalls.push(size)
            },
          }),
          route: async () => {
            state.context.routeCalls += 1
          },
          routeWebSocket: async () => {
            state.context.routeWebSocketCalls += 1
          },
        }
      },
    }
    return browser as unknown as import('playwright-core').Browser
  }

  return { ...state, connector }
}

/**
 * Simulate what the browser-side DOM script would return for each command
 * kind. For inspect commands, return the target dimensions (or an error). For
 * prepare commands, return a clip + empty elementMap. For cleanup/ready, void.
 */
function simulateEvaluate(
  script: string,
  inspectResult?: FakeBrowserOptions['inspectResult'],
): unknown {
  if (script.includes('document.images') || script.includes('document.fonts')) {
    return undefined
  }
  // Extract the JSON command argument from the interpolated script string.
  const match = /\(({.*})\)$/.exec(script)
  if (!match) return undefined
  const command = JSON.parse(match[1]!) as { kind: string }

  if (command.kind === 'inspect') {
    if (inspectResult && 'error' in inspectResult) return inspectResult
    if (inspectResult) return inspectResult
    return { height: TARGET_HEIGHT, width: TARGET_WIDTH }
  }
  if (command.kind === 'prepare') {
    return {
      clip: { height: 200, scale: 0.5, width: 340, x: 0, y: 0 },
      elementMap: '',
    }
  }
  return undefined
}
