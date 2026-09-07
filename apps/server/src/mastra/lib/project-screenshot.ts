import { randomUUID } from 'node:crypto'

import { config } from '../../config.ts'
import {
  OperationDrainError,
  type OperationContext,
  type OperationScope,
  runProviderOperation,
} from '../../providers/operation-scope.ts'
import {
  createProviderTransport,
  type ProviderTransport,
} from '../../providers/transport.ts'
import type { ProjectRepository, ProjectScreenshot } from './project-store.ts'

const DEFAULT_CAPTURE_TIMEOUT_MS = 45_000
const FIRECRAWL_API_URL = 'https://api.firecrawl.dev'
const FIRECRAWL_SCRAPE_TIMEOUT_MS = 30_000
const PUBLISH_API_URL =
  'https://litterbox.catbox.moe/resources/internals/api.php'
const PUBLISH_RETRY_DELAY_MS = 5_000
const PUBLISH_ROUNDS = 3
const PUBLISH_TTL = '72h'
const SCRAPE_WAIT_FOR_MS = 1_000

export const PROJECT_SCREENSHOT_VIEWPORTS = [
  { height: 844, name: 'mobile', width: 390 },
  { height: 1024, name: 'tablet', width: 768 },
  { height: 900, name: 'desktop', width: 1440 },
] as const

export interface CapturedProjectScreenshot {
  dataUrl: string
  elementMap: string
  height: number
  imageUrl: string
  mediaType: 'image/png'
  viewport: ProjectScreenshotViewport
  width: number
}

export interface CapturedProjectSelector {
  captures: CapturedProjectScreenshot[]
  selector: string
}

export interface CaptureProjectSelectorsInput {
  html: string
  operations?: OperationScope
  projectId: string
  selectors: string[]
  signal?: AbortSignal
  timeoutMs?: number
  transport?: ProviderTransport
}

export interface FirecrawlConfig {
  apiKey?: string
  apiUrl?: string
}

export interface ProjectScreenshotDependencies {
  firecrawl?: FirecrawlConfig
  inlineProjectImages: ProjectRepository['inlineProjectImagesForCapture']
  /** Provider-reported Firecrawl credits (sum of scrape `creditsUsed`). */
  onFirecrawlCredits?: (credits: number) => void
  persistScreenshot: (
    projectId: string,
    requestId: string,
    dataUrl: string,
    mediaType: string,
  ) => ProjectScreenshot
  publishHtml?: (html: string, operation: OperationContext) => Promise<string>
  scrapeScreenshot?: (
    input: ScrapeScreenshotInput,
  ) => Promise<ScrapedScreenshot>
}

export type ProjectScreenshotViewport =
  (typeof PROJECT_SCREENSHOT_VIEWPORTS)[number]['name']

export interface ScrapedScreenshot {
  creditsUsed?: number
  dataUrl: string
  height: number
  width: number
}

export interface ScrapeScreenshotInput {
  apiKey: string
  apiUrl?: string | undefined
  operation?: OperationContext
  operations?: OperationScope
  signal?: AbortSignal
  timeoutMs: number
  transport?: ProviderTransport
  url: string
  viewport: { height: number; width: number }
}

export class ProjectScreenshotCaptureError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProjectScreenshotCaptureError'
  }
}

/**
 * Statically list interactive elements in document order — the same order the
 * injected badge script numbers them — as `index role "name" state=...` rows.
 * No geometry: there is no post-resize readback channel in Firecrawl scrape,
 * so positions come from the badges in the screenshots themselves.
 */
export function buildStaticElementMap(html: string): string {
  const rows: string[] = []
  let index = 0
  for (const match of html.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g)) {
    const tag = (match[1] ?? '').toLowerCase()
    const rawAttrs = match[2] ?? ''
    const attrs = parseAttrs(rawAttrs)
    if (!isInteractiveTag(tag, attrs)) continue
    const name = captureName(
      tag,
      attrs,
      html,
      (match.index ?? 0) + match[0].length,
    )
    rows.push(
      `${index} ${captureRole(tag, attrs)} "${name}" state=${captureState(attrs)}`,
    )
    index++
  }
  return rows.join('\n')
}

/**
 * Capture the current project HTML as full-page screenshots at three fixed
 * viewports (mobile, tablet, desktop). The document is published to a
 * temporary public host (72h TTL), then scraped once per viewport via
 * Firecrawl's `/v2/scrape` `{type:'screenshot', fullPage, viewport}` format —
 * one publish, three parallel scrapes, each cache-busted by a query param.
 * Before publishing, same-project images are inlined as data URLs, page
 * scripts are stripped (no-JS parity with the old CDP pipeline), and the
 * capture asset bundle is injected: CSS that freezes animations/transitions
 * at their end state plus a badge script that numbers interactive elements
 * and redraws on `resize` (Firecrawl loads at 1920px, then resizes to the
 * target viewport before capturing, so the redraw lands at the right
 * geometry). The textual `elementMap` is parsed statically from the HTML in
 * the same document order the badge script numbers, minus geometry. A mobile
 * capture shorter than the desktop one is re-scraped once (Firecrawl
 * occasionally truncates full-page scroll-stitching at narrow viewports).
 */
export async function captureProjectSelectors(
  input: CaptureProjectSelectorsInput,
  dependencies: ProjectScreenshotDependencies,
): Promise<CapturedProjectSelector[]> {
  try {
    return await runProviderOperation(
      input.operations,
      'project-screenshot',
      (operation) =>
        captureProjectSelectorsOwned(input, dependencies, operation),
      { signal: input.signal },
    )
  } catch (error) {
    throw normalizeCaptureError(error, input.signal)
  }
}

export function injectCaptureAssets(html: string): string {
  const withoutScripts = html.replace(
    /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,
    '',
  )
  const assets = `<style>${FREEZE_CSS}</style><script>${BADGE_SCRIPT}</script>`
  if (/<\/head>/i.test(withoutScripts)) {
    return withoutScripts.replace(/<\/head>/i, `${assets}</head>`)
  }
  if (/<\/body>/i.test(withoutScripts)) {
    return withoutScripts.replace(/<\/body>/i, `${assets}</body>`)
  }
  return withoutScripts + assets
}

/**
 * Default publisher: litterbox ephemeral file host (no key, 72h TTL). The
 * host occasionally has short 500-blips (observed taking out two back-to-back
 * capture attempts in a live run), so publishing retries up to three rounds
 * spaced by `PUBLISH_RETRY_DELAY_MS`. Each round uses the shared transport's
 * bounded safe-read retry policy before the capture surfaces the failure.
 */
export async function publishHtmlEphemeral(
  html: string,
  signal?: AbortSignal,
  options: { retryDelayMs?: number; transport?: ProviderTransport } = {},
): Promise<string> {
  return runProviderOperation(
    undefined,
    'publish-html',
    (operation) =>
      publishHtmlEphemeralOwned(
        html,
        operation,
        options.transport ?? createProviderTransport(),
        options,
      ),
    { signal },
  )
}

/** Default scraper: Firecrawl `/v2/scrape` full-page screenshot at one viewport. */
export async function scrapeFullPageScreenshot(
  input: ScrapeScreenshotInput,
): Promise<ScrapedScreenshot> {
  if (input.operation) {
    return scrapeFullPageScreenshotOwned(input, input.operation)
  }
  return runProviderOperation(
    input.operations,
    'firecrawl-screenshot',
    (operation) => scrapeFullPageScreenshotOwned(input, operation),
    { signal: input.signal },
  )
}

function captureName(
  tag: string,
  attrs: Map<string, string>,
  html: string,
  contentStart: number,
): string {
  const labelled =
    attrs.get('aria-label') ??
    attrs.get('alt') ??
    attrs.get('value') ??
    attrs.get('placeholder') ??
    attrs.get('title')
  const source =
    labelled ??
    (tag === 'input'
      ? ''
      : html.slice(contentStart, contentStart + 400).split('<')[0])
  return (source ?? '').replace(/\s+/g, ' ').trim().slice(0, 160)
}

async function captureProjectSelectorsOwned(
  input: CaptureProjectSelectorsInput,
  dependencies: ProjectScreenshotDependencies,
  operation: OperationContext,
): Promise<CapturedProjectSelector[]> {
  const firecrawl: FirecrawlConfig = dependencies.firecrawl ?? config.firecrawl
  const apiKey = firecrawl.apiKey?.trim()
  if (!apiKey) {
    throw new ProjectScreenshotCaptureError(
      'Firecrawl is not configured. Set FIRECRAWL_API_KEY.',
    )
  }

  const selectors = normalizeSelectors(input.selectors)
  const timeoutMs = input.timeoutMs ?? DEFAULT_CAPTURE_TIMEOUT_MS
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new ProjectScreenshotCaptureError(
      'Screenshot capture timeout is invalid.',
    )
  }
  operation.assertActive()

  const transport = input.transport ?? createProviderTransport()
  const inlineImages = dependencies.inlineProjectImages
  const publish =
    dependencies.publishHtml ??
    ((html: string, parent: OperationContext) =>
      publishHtmlEphemeralOwned(html, parent, transport))
  const scrape = dependencies.scrapeScreenshot
  const persist = dependencies.persistScreenshot

  try {
    const preparedHtml = await inlineImages(input.projectId, input.html)
    operation.assertActive()
    const elementMap = buildStaticElementMap(preparedHtml)
    const publishedUrl = await operation.runChild('publish-html', (child) =>
      publish(injectCaptureAssets(preparedHtml), child),
    )

    let creditsTotal = 0
    const captureViewport = (
      viewport: (typeof PROJECT_SCREENSHOT_VIEWPORTS)[number],
      attempt: number,
      batchSignal?: AbortSignal,
    ): Promise<CapturedProjectScreenshot> =>
      operation.runChild(
        `capture-${viewport.name}:${attempt}`,
        async (child) => {
          const scraped = scrape
            ? await scrape({
                apiKey,
                apiUrl: firecrawl.apiUrl,
                operation: child,
                signal: batchSignal,
                timeoutMs,
                transport,
                url: `${publishedUrl}?agent-viewport=${viewport.name}&retry=${attempt}`,
                viewport: { height: viewport.height, width: viewport.width },
              })
            : await scrapeFullPageScreenshotOwned(
                {
                  apiKey,
                  apiUrl: firecrawl.apiUrl,
                  signal: batchSignal,
                  timeoutMs,
                  transport,
                  url: `${publishedUrl}?agent-viewport=${viewport.name}&retry=${attempt}`,
                  viewport: { height: viewport.height, width: viewport.width },
                },
                child,
              )
          if (
            typeof scraped.creditsUsed === 'number' &&
            scraped.creditsUsed > 0
          )
            creditsTotal += scraped.creditsUsed
          const lease = child.createWriteLease()
          batchSignal?.throwIfAborted()
          lease.assertWriteAllowed()
          const persisted = persist?.(
            input.projectId,
            randomUUID(),
            scraped.dataUrl,
            'image/png',
          )
          if (!persisted) {
            throw new ProjectScreenshotCaptureError(
              'Screenshot persistence is unavailable in this runtime.',
            )
          }
          return {
            dataUrl: scraped.dataUrl,
            elementMap,
            height: scraped.height,
            imageUrl: persisted.path,
            mediaType: 'image/png' as const,
            viewport: viewport.name,
            width: scraped.width,
          }
        },
      )

    const batchController = new AbortController()
    const batch = PROJECT_SCREENSHOT_VIEWPORTS.map((viewport) =>
      captureViewport(viewport, 0, batchController.signal),
    )
    for (const pending of batch) {
      void pending.catch(() => batchController.abort())
    }
    let captures: CapturedProjectScreenshot[]
    try {
      captures = await Promise.all(batch)
    } catch (error) {
      batchController.abort(error)
      const cleaned = await operation.drainChildren(batch)
      if (!cleaned.ok) throw new OperationDrainError(cleaned)
      throw error
    }

    const mobileIndex = captures.findIndex(
      (capture) => capture.viewport === 'mobile',
    )
    const desktop = captures.find((capture) => capture.viewport === 'desktop')
    const mobile = captures[mobileIndex]
    if (mobile && desktop && mobile.height < desktop.height) {
      captures[mobileIndex] = await captureViewport(
        PROJECT_SCREENSHOT_VIEWPORTS[0],
        1,
      )
    }

    if (creditsTotal > 0) dependencies.onFirecrawlCredits?.(creditsTotal)
    return selectors.map((selector) => ({ captures, selector }))
  } catch (error) {
    throw normalizeCaptureError(error, operation.signal)
  }
}

function captureRole(tag: string, attrs: Map<string, string>): string {
  const explicit = attrs.get('role')?.trim()
  if (explicit) return explicit
  if (tag === 'a') return 'link'
  if (tag === 'button' || tag === 'summary') return 'button'
  if (tag === 'select') return 'combobox'
  if (tag === 'textarea') return 'textbox'
  if (tag === 'input') {
    const type = (attrs.get('type') ?? '').toLowerCase()
    if (type === 'checkbox' || type === 'radio') return type
    if (type === 'submit' || type === 'button' || type === 'reset')
      return 'button'
    return 'textbox'
  }
  return tag
}

function captureState(attrs: Map<string, string>): string {
  const states: string[] = []
  if (attrs.has('disabled') || attrs.get('aria-disabled') === 'true')
    states.push('disabled')
  for (const name of ['checked', 'expanded', 'pressed', 'selected']) {
    const value = attrs.get(`aria-${name}`)
    if (value) states.push(`${name}:${value}`)
  }
  if (attrs.has('required')) states.push('required')
  if (attrs.get('aria-invalid') === 'true') states.push('invalid')
  return states.length > 0 ? states.join(',') : 'enabled'
}

function isInteractiveTag(tag: string, attrs: Map<string, string>): boolean {
  if (tag === 'a') return attrs.has('href')
  if (
    tag === 'button' ||
    tag === 'select' ||
    tag === 'textarea' ||
    tag === 'summary'
  )
    return true
  if (tag === 'input')
    return (attrs.get('type') ?? '').toLowerCase() !== 'hidden'
  if (attrs.has('role')) return true
  const tabindex = attrs.get('tabindex')
  if (tabindex != null && tabindex !== '-1') return true
  return attrs.get('contenteditable') === 'true'
}

function parseAttrs(raw: string): Map<string, string> {
  const attrs = new Map<string, string>()
  for (const match of raw.matchAll(
    /([a-zA-Z-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g,
  )) {
    const name = (match[1] ?? '').toLowerCase()
    if (name) attrs.set(name, match[2] ?? match[3] ?? match[4] ?? '')
  }
  return attrs
}

/** Read width/height from a PNG IHDR. */
function pngDimensions(buffer: Buffer): { height: number; width: number } {
  if (buffer.length < 24 || buffer.subarray(1, 4).toString() !== 'PNG') {
    throw new ProjectScreenshotCaptureError(
      'Firecrawl returned a non-PNG screenshot.',
    )
  }
  return { height: buffer.readUInt32BE(20), width: buffer.readUInt32BE(16) }
}

async function publishHtmlEphemeralOwned(
  html: string,
  operation: OperationContext,
  transport: ProviderTransport,
  options: { retryDelayMs?: number } = {},
): Promise<string> {
  const retryDelayMs = options.retryDelayMs ?? PUBLISH_RETRY_DELAY_MS
  const form = new FormData()
  form.append('reqtype', 'fileupload')
  form.append('time', PUBLISH_TTL)
  form.append(
    'fileToUpload',
    new Blob([html], { type: 'text/html' }),
    'capture.html',
  )
  let lastReason = 'HTML publish failed.'
  for (let round = 0; round < PUBLISH_ROUNDS; round += 1) {
    if (round > 0) await sleepAbortable(retryDelayMs, operation.signal)
    const fetched = await transport.text({
      baseDelayMs: 1_000,
      init: { body: form, method: 'POST' },
      label: 'HTML publish',
      maxAttempts: 3,
      operation,
      retry: 'safe',
      url: PUBLISH_API_URL,
    })
    if (fetched.ok) {
      const url = fetched.value.trim()
      if (/^https:\/\/\S+$/.test(url)) return url
      lastReason = `HTML publish returned an unexpected response: ${url.slice(0, 120)}`
      continue
    }
    lastReason = `HTML publish failed: ${fetched.error.message}`
  }
  throw new ProjectScreenshotCaptureError(lastReason)
}

async function scrapeFullPageScreenshotOwned(
  input: ScrapeScreenshotInput,
  operation: OperationContext,
): Promise<ScrapedScreenshot> {
  const base = (input.apiUrl ?? FIRECRAWL_API_URL).replace(/\/+$/, '')
  const transport = input.transport ?? createProviderTransport()
  const fetched = await transport.json<{
    data?: { metadata?: { creditsUsed?: unknown }; screenshot?: unknown }
    success?: unknown
  }>({
    init: {
      body: JSON.stringify({
        formats: [
          {
            fullPage: true,
            type: 'screenshot',
            viewport: input.viewport,
          },
        ],
        maxAge: 0,
        timeout: FIRECRAWL_SCRAPE_TIMEOUT_MS,
        url: input.url,
        waitFor: SCRAPE_WAIT_FOR_MS,
      }),
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal: input.signal,
    },
    label: 'Firecrawl screenshot scrape',
    operation,
    retry: 'paid',
    url: `${base}/v2/scrape`,
  })
  if (!fetched.ok) {
    if (fetched.error.status === 402) {
      throw new ProjectScreenshotCaptureError(
        'Firecrawl screenshot scrape failed: payment required (credits exhausted).',
      )
    }
    throw new ProjectScreenshotCaptureError(fetched.error.message)
  }
  const json = fetched.value
  const creditsUsed = json.data?.metadata?.creditsUsed
  const credits =
    typeof creditsUsed === 'number' && Number.isFinite(creditsUsed)
      ? creditsUsed
      : undefined
  operation.reportUsage({
    amount: credits ?? 0,
    category: 'firecrawl',
    count: 1,
    reportId: 'firecrawl-response',
    source: 'screenshot',
    unit: 'credits',
  })
  const screenshotUrl = json.data?.screenshot
  if (
    json.success !== true ||
    typeof screenshotUrl !== 'string' ||
    !screenshotUrl
  ) {
    throw new ProjectScreenshotCaptureError(
      'Firecrawl screenshot scrape returned no screenshot.',
    )
  }

  const downloaded = await operation.runChild('screenshot-download', (child) =>
    transport.bytes({
      init: { method: 'GET', signal: input.signal },
      label: 'screenshot download',
      maxAttempts: 2,
      operation: child,
      retry: 'safe',
      url: screenshotUrl,
    }),
  )
  if (!downloaded.ok) {
    throw new ProjectScreenshotCaptureError(
      'Firecrawl screenshot download failed.',
    )
  }
  const buffer = Buffer.from(downloaded.value)
  const dimensions = pngDimensions(buffer)
  return {
    creditsUsed: credits,
    dataUrl: `data:image/png;base64,${buffer.toString('base64')}`,
    height: dimensions.height,
    width: dimensions.width,
  }
}

async function sleepAbortable(ms: number, signal?: AbortSignal) {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(finish, ms)
    function finish() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      resolve()
    }
    function abort() {
      clearTimeout(timer)
      reject(
        new ProjectScreenshotCaptureError('Screenshot capture was stopped.'),
      )
    }
    signal?.addEventListener('abort', abort, { once: true })
  })
}

/** Kill animations/transitions so captures always show the end state. */
const FREEZE_CSS =
  '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important}'

/**
 * Numbered red badges on interactive elements. Firecrawl loads the page at a
 * 1920px viewport and resizes to the requested capture viewport before
 * screenshotting, so badges redraw on `resize` to land at the right geometry.
 * The index increments for EVERY matching element in document order (even
 * hidden ones, whose badge is skipped) so badge numbers line up with the
 * statically-parsed elementMap rows.
 */
const BADGE_SCRIPT = `(function(){
  var INTERACTIVE = 'a[href],button,input:not([type="hidden"]),select,textarea,summary,[role],[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';
  function draw(){
    document.querySelectorAll('[data-agent-badge]').forEach(function(n){n.remove()});
    var els = document.querySelectorAll(INTERACTIVE);
    for (var i = 0; i < els.length; i++) {
      var r = els[i].getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      var b = document.createElement('span');
      b.setAttribute('data-agent-badge','1');
      b.textContent = String(i);
      b.style.cssText = 'position:absolute;left:'+(r.left+window.scrollX-6)+'px;top:'+(r.top+window.scrollY-6)+'px;background:#dc2626;color:#fff;border:1px solid #fff;border-radius:999px;box-sizing:border-box;min-width:16px;height:16px;padding:0 3px;font:700 10px/14px Arial,sans-serif;text-align:center;pointer-events:none;z-index:2147483647;';
      document.body.appendChild(b);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', draw);
  else draw();
  window.addEventListener('resize', draw);
})();`

function normalizeCaptureError(error: unknown, signal?: AbortSignal): Error {
  if (error instanceof OperationDrainError) return error
  if (error instanceof ProjectScreenshotCaptureError) return error
  if (signal?.aborted) {
    return new ProjectScreenshotCaptureError('Screenshot capture was stopped.')
  }
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (/429|rate limit|too many/.test(message)) {
    return new ProjectScreenshotCaptureError(
      'Firecrawl is rate limited. Try again shortly.',
    )
  }
  if (/401|403|unauthori[sz]ed|forbidden/.test(message)) {
    return new ProjectScreenshotCaptureError(
      'Firecrawl authentication failed. Check FIRECRAWL_API_KEY.',
    )
  }
  if (/timeout|timed out/.test(message)) {
    return new ProjectScreenshotCaptureError(
      'Firecrawl screenshot capture timed out.',
    )
  }
  return new ProjectScreenshotCaptureError(
    'Firecrawl screenshot capture failed.',
  )
}

function normalizeSelectors(selectors: string[]): string[] {
  if (!Array.isArray(selectors) || selectors.length === 0) {
    throw new ProjectScreenshotCaptureError(
      'Screenshot capture requires at least one selector.',
    )
  }
  return selectors.map((selector) => {
    if (typeof selector !== 'string' || selector.trim().length === 0) {
      throw new ProjectScreenshotCaptureError(
        'Screenshot capture selectors must be non-empty strings.',
      )
    }
    if (selector.length > 300) {
      throw new ProjectScreenshotCaptureError(
        'Screenshot capture selector is too long.',
      )
    }
    return selector
  })
}
