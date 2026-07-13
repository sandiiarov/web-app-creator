import { randomUUID } from 'node:crypto'

import {
  chromium,
  type Browser,
  type BrowserContext,
  type CDPSession,
  type Page,
} from 'playwright-core'

import { config } from '../../config.ts'
import {
  inlineProjectImagesForCapture,
  writeProjectScreenshotSync,
  type ProjectScreenshot,
} from './project-store.ts'

const CDP_KEEP_ALIVE_MS = 15_000
const DEFAULT_CAPTURE_TIMEOUT_MS = 25_000
const JPEG_QUALITY = 90
const MAX_OUTPUT_DIMENSION = 4096
const OUTPUT_PADDING_PX = 8
const RETRY_DELAY_MS = 250
const RATE_LIMIT_RETRY_DELAY_MS = 2_000

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
  mediaType: 'image/jpeg'
  viewport: ProjectScreenshotViewport
  width: number
}

export interface CapturedProjectSelector {
  captures: CapturedProjectScreenshot[]
  selector: string
}

export interface CaptureProjectSelectorsInput {
  html: string
  projectId: string
  selectors: string[]
  signal?: AbortSignal
  timeoutMs?: number
}

export interface CloudflareBrowserRunConfig {
  accountId?: string
  apiToken?: string
}

export interface ProjectScreenshotDependencies {
  cloudflare?: CloudflareBrowserRunConfig
  connectOverCDP?: BrowserConnector
  inlineProjectImages?: typeof inlineProjectImagesForCapture
  now?: () => number
  persistScreenshot?: (
    projectId: string,
    requestId: string,
    dataUrl: string,
    mediaType: string,
  ) => ProjectScreenshot
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
}

export type ProjectScreenshotViewport =
  (typeof PROJECT_SCREENSHOT_VIEWPORTS)[number]['name']

type BrowserConnector = (
  endpoint: string,
  options: BrowserConnectorOptions,
) => Promise<Browser>

interface BrowserConnectorOptions {
  headers: Record<string, string>
  timeout: number
}

interface CaptureClip {
  height: number
  scale: number
  width: number
  x: number
  y: number
}

type CaptureDomCommand =
  | { kind: 'cleanup'; token: string }
  | { kind: 'inspect'; selector: string }
  | {
      kind: 'prepare'
      paddingCss: number
      scale: number
      selector: string
      token: string
    }

interface CaptureError {
  error: string
}

interface InspectionResult {
  height: number
  width: number
}

interface PreparationResult {
  clip: CaptureClip
  elementMap: string
}

export class ProjectScreenshotCaptureError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProjectScreenshotCaptureError'
  }
}

/**
 * Capture one or more project selectors in a single isolated Cloudflare Browser
 * Run browser session. Captures are ordered mobile, tablet, desktop for each
 * selector and are persisted before their safe project URLs are returned.
 */
export async function captureProjectSelectors(
  input: CaptureProjectSelectorsInput,
  dependencies: ProjectScreenshotDependencies = {},
): Promise<CapturedProjectSelector[]> {
  const cloudflare = dependencies.cloudflare ?? config.cloudflare
  const accountId = cloudflare.accountId?.trim()
  const apiToken = cloudflare.apiToken?.trim()
  if (!accountId || !apiToken) {
    throw new ProjectScreenshotCaptureError(
      'Cloudflare Browser Run is not configured. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.',
    )
  }

  const selectors = normalizeSelectors(input.selectors)
  const timeoutMs = input.timeoutMs ?? DEFAULT_CAPTURE_TIMEOUT_MS
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new ProjectScreenshotCaptureError(
      'Screenshot capture timeout is invalid.',
    )
  }
  throwIfAborted(input.signal)

  const inlineImages =
    dependencies.inlineProjectImages ?? inlineProjectImagesForCapture
  const preparedHtml = await inlineImages(input.projectId, input.html)
  const now = dependencies.now ?? Date.now
  const deadline = now() + timeoutMs
  const connector = dependencies.connectOverCDP ?? defaultConnectOverCDP
  const persist = dependencies.persistScreenshot ?? writeProjectScreenshotSync
  const sleep = dependencies.sleep ?? sleepWithAbort

  let browser: Browser | undefined
  let context: BrowserContext | undefined

  try {
    browser = await connectBrowser({
      accountId,
      apiToken,
      connector,
      deadline,
      now,
      signal: input.signal,
      sleep,
    })
    context = await awaitWithinDeadline(
      browser.newContext({
        javaScriptEnabled: true,
      }),
      deadline,
      now,
      input.signal,
    )
    const page = await awaitWithinDeadline(
      context.newPage(),
      deadline,
      now,
      input.signal,
    )
    const cdp = await awaitWithinDeadline(
      context.newCDPSession(page),
      deadline,
      now,
      input.signal,
    )

    const capturesBySelector = selectors.map((selector) => ({
      captures: [] as CapturedProjectScreenshot[],
      selector,
    }))
    for (const viewport of PROJECT_SCREENSHOT_VIEWPORTS) {
      await awaitWithinDeadline(
        page.setViewportSize({
          height: viewport.height,
          width: viewport.width,
        }),
        deadline,
        now,
        input.signal,
      )
      await awaitWithinDeadline(
        page.setContent(preparedHtml, { waitUntil: 'domcontentloaded' }),
        deadline,
        now,
        input.signal,
      )
      await waitForRenderedDocument(page, deadline, now, input.signal)

      for (const entry of capturesBySelector) {
        const screenshot = await captureSelector({
          cdp,
          deadline,
          now,
          page,
          persist,
          projectId: input.projectId,
          selector: entry.selector,
          signal: input.signal,
          viewport: viewport.name,
        })
        entry.captures.push(screenshot)
      }
    }

    return capturesBySelector
  } catch (error) {
    throw normalizeCaptureError(error, input.signal)
  } finally {
    await closeQuietly(context)
    await closeQuietly(browser)
  }
}

/** Build the authenticated remote CDP endpoint without placing the token in it. */
export function cloudflareBrowserRunEndpoint(accountId: string): string {
  return `wss://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/browser-rendering/devtools/browser?keep_alive=${CDP_KEEP_ALIVE_MS}`
}

/** Output dimensions after a fractional CDP clip capture. */
export function screenshotOutputDimensions(
  width: number,
  height: number,
  scale: number,
): { height: number; width: number } {
  const paddingCss = OUTPUT_PADDING_PX / scale
  return {
    height: Math.max(1, Math.round((height + paddingCss * 2) * scale)),
    width: Math.max(1, Math.round((width + paddingCss * 2) * scale)),
  }
}

/** Keep the final JPEG under 4096px while preserving an 8px output border. */
export function screenshotScale(width: number, height: number): number {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new ProjectScreenshotCaptureError(
      'Screenshot target has invalid dimensions.',
    )
  }
  return Math.min(
    0.5,
    (MAX_OUTPUT_DIMENSION - OUTPUT_PADDING_PX * 2) / width,
    (MAX_OUTPUT_DIMENSION - OUTPUT_PADDING_PX * 2) / height,
  )
}

/**
 * Serialize the browser-side DOM command as a self-contained script string.
 * The command (controlled values only) is JSON-interpolated as the argument;
 * `JSON.stringify` cannot break out of the string literal, so the selector
 * cannot inject script. This avoids needing DOM types in the server tsconfig.
 */
function buildCaptureDomScript(command: CaptureDomCommand): string {
  return `(${CAPTURE_DOM_SOURCE})(${JSON.stringify(command)})`
}

async function captureSelector({
  cdp,
  deadline,
  now,
  page,
  persist,
  projectId,
  selector,
  signal,
  viewport,
}: {
  cdp: CDPSession
  deadline: number
  now: () => number
  page: Page
  persist: ProjectScreenshotDependencies['persistScreenshot']
  projectId: string
  selector: string
  signal?: AbortSignal
  viewport: ProjectScreenshotViewport
}): Promise<CapturedProjectScreenshot> {
  const inspection = await evaluateCaptureCommand<
    CaptureError | InspectionResult
  >(page, { kind: 'inspect', selector }, deadline, now, signal)
  assertNoCaptureError(inspection, selector)
  if (!inspection.width || !inspection.height) {
    throw new ProjectScreenshotCaptureError(
      `Screenshot target "${selector}" has invalid dimensions.`,
    )
  }

  const scale = screenshotScale(inspection.width, inspection.height)
  const token = `agent-capture-${randomUUID()}`
  const preparation = await evaluateCaptureCommand<
    CaptureError | PreparationResult
  >(
    page,
    {
      kind: 'prepare',
      paddingCss: OUTPUT_PADDING_PX / scale,
      scale,
      selector,
      token,
    },
    deadline,
    now,
    signal,
  )
  assertNoCaptureError(preparation, selector)
  if (!preparation.clip) {
    throw new ProjectScreenshotCaptureError(
      `Unable to prepare screenshot target "${selector}".`,
    )
  }

  try {
    const result = await awaitWithinDeadline(
      cdp.send('Page.captureScreenshot', {
        captureBeyondViewport: true,
        clip: preparation.clip,
        format: 'jpeg',
        fromSurface: true,
        quality: JPEG_QUALITY,
      }),
      deadline,
      now,
      signal,
    )
    const data = screenshotData(result)
    const dimensions = screenshotOutputDimensions(
      inspection.width,
      inspection.height,
      scale,
    )
    const dataUrl = `data:image/jpeg;base64,${data}`
    const persisted = persist?.(projectId, randomUUID(), dataUrl, 'image/jpeg')
    if (!persisted) {
      throw new ProjectScreenshotCaptureError(
        'Screenshot persistence is unavailable in this runtime.',
      )
    }

    return {
      dataUrl,
      elementMap: preparation.elementMap,
      height: dimensions.height,
      imageUrl: persisted.path,
      mediaType: 'image/jpeg',
      viewport,
      width: dimensions.width,
    }
  } finally {
    await evaluateCaptureCommand(
      page,
      { kind: 'cleanup', token },
      deadline,
      now,
    ).catch(() => undefined)
  }
}

async function connectBrowser({
  accountId,
  apiToken,
  connector,
  deadline,
  now,
  signal,
  sleep,
}: {
  accountId: string
  apiToken: string
  connector: BrowserConnector
  deadline: number
  now: () => number
  signal?: AbortSignal
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>
}): Promise<Browser> {
  const endpoint = cloudflareBrowserRunEndpoint(accountId)
  for (let attempt = 0; attempt < 2; attempt += 1) {
    throwIfAborted(signal)
    const connectPromise = connector(endpoint, {
      headers: { Authorization: `Bearer ${apiToken}` },
      timeout: remainingMs(deadline, now),
    })
    try {
      return await awaitWithinDeadline(connectPromise, deadline, now, signal)
    } catch (error) {
      void connectPromise.then(closeQuietly, () => undefined)
      // Daily browser-time limit is a hard stop — never retry.
      if (isDailyLimitError(error)) throw error
      if (
        attempt === 0 &&
        isRetryableConnectionError(error) &&
        remainingMs(deadline, now) > RETRY_DELAY_MS
      ) {
        const delay = isRateLimitError(error)
          ? Math.min(
              RATE_LIMIT_RETRY_DELAY_MS,
              remainingMs(deadline, now) - RETRY_DELAY_MS,
            )
          : RETRY_DELAY_MS
        await sleep(delay, signal)
        continue
      }
      throw error
    }
  }
  throw new ProjectScreenshotCaptureError(
    'Cloudflare Browser Run capture failed.',
  )
}

async function evaluateCaptureCommand<T>(
  page: Page,
  command: CaptureDomCommand,
  deadline: number,
  now: () => number,
  signal?: AbortSignal,
): Promise<T> {
  return awaitWithinDeadline(
    page.evaluate(buildCaptureDomScript(command)) as Promise<T>,
    deadline,
    now,
    signal,
  )
}

async function waitForRenderedDocument(
  page: Page,
  deadline: number,
  now: () => number,
  signal?: AbortSignal,
): Promise<void> {
  await awaitWithinDeadline(
    page.evaluate(CAPTURE_READY_SCRIPT),
    deadline,
    now,
    signal,
  )
  // Let CSS/JS init animations (fade-in, slide-up, etc.) settle.
  await awaitWithinDeadline(page.waitForTimeout(500), deadline, now, signal)
}

/**
 * Runs inside the isolated browser document through trusted CDP evaluation.
 * JavaScript is disabled on the page context; Playwright's `evaluate` is the
 * trusted channel that runs this regardless of the page script setting.
 */
const CAPTURE_DOM_SOURCE = String.raw`
function captureDomCommand(command) {
  function selectCaptureTarget(selector) {
    try {
      const target = document.querySelector(selector);
      return target || { error: 'No element matches selector "' + selector + '".' };
    } catch (e) {
      return { error: 'Invalid CSS selector "' + selector + '".' };
    }
  }
  function captureName(element) {
    var ariaLabel = (element.getAttribute('aria-label') || '').trim();
    if (ariaLabel) return ariaLabel.replace(/\s+/g, ' ');
    var labelledBy = (element.getAttribute('aria-labelledby') || '').trim();
    if (labelledBy) {
      var text = labelledBy.split(/\s+/).map(function (id) {
        var el = document.getElementById(id);
        return el ? (el.textContent || '').trim() : '';
      }).filter(Boolean).join(' ');
      if (text) return text.replace(/\s+/g, ' ');
    }
    var raw = element.getAttribute('alt') ||
      element.getAttribute('value') ||
      element.getAttribute('placeholder') ||
      element.getAttribute('title') ||
      element.textContent || '';
    return raw.replace(/\s+/g, ' ').trim().slice(0, 160);
  }
  function captureRole(element) {
    var explicit = (element.getAttribute('role') || '').trim();
    if (explicit) return explicit;
    var tag = element.tagName.toLowerCase();
    if (tag === 'a') return 'link';
    if (tag === 'button' || tag === 'summary') return 'button';
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'input') {
      var type = (element.getAttribute('type') || '').toLowerCase();
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (type === 'submit' || type === 'button' || type === 'reset') return 'button';
      return 'textbox';
    }
    return tag;
  }
  function captureState(element) {
    var states = [];
    if (element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true') states.push('disabled');
    ['checked', 'expanded', 'pressed', 'selected'].forEach(function (name) {
      var value = element.getAttribute('aria-' + name);
      if (value) states.push(name + ':' + value);
    });
    if (element.hasAttribute('required')) states.push('required');
    if (element.getAttribute('aria-invalid') === 'true') states.push('invalid');
    return states.length > 0 ? states.join(',') : 'enabled';
  }
  function captureXPath(element) {
    var parts = [];
    var current = element;
    while (current) {
      var tag = current.tagName.toLowerCase();
      if (current.id) {
        parts.unshift(tag + '[@id="' + current.id + '"]');
        break;
      }
      var siblings = current.parentElement
        ? Array.from(current.parentElement.children).filter(function (c) { return c.tagName === current.tagName; })
        : [];
      parts.unshift(tag + '[' + (siblings.indexOf(current) + 1) + ']');
      current = current.parentElement;
    }
    return '/' + parts.join('/');
  }
  function isVisible(element) {
    var style = window.getComputedStyle(element);
    var rect = element.getBoundingClientRect();
    return style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      Number(style.opacity) !== 0 &&
      rect.width > 0 &&
      rect.height > 0;
  }
  var INTERACTIVE = 'a[href],button,input:not([type="hidden"]),select,textarea,summary,[role],[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';

  if (command.kind === 'cleanup') {
    var nodes = document.querySelectorAll('[data-agent-capture-token="' + command.token + '"]');
    for (var i = 0; i < nodes.length; i++) nodes[i].remove();
    var root = document.documentElement;
    var original = root.getAttribute('data-agent-capture-original-styles');
    if (original !== null) {
      var styles = JSON.parse(original);
      root.style.transform = styles.transform;
      root.style.transformOrigin = styles.transformOrigin;
      root.style.translate = styles.translate;
      root.removeAttribute('data-agent-capture-original-styles');
    }
    return null;
  }

  var target = selectCaptureTarget(command.selector);
  if (target.error) return { error: target.error };

  var targetRect = target.getBoundingClientRect();
  if (!isFinite(targetRect.width) || !isFinite(targetRect.height)) {
    return { error: 'Screenshot target "' + command.selector + '" has invalid dimensions.' };
  }
  if (targetRect.width <= 0 || targetRect.height <= 0) {
    return { error: 'Screenshot target "' + command.selector + '" has zero size.' };
  }

  if (command.kind === 'inspect') {
    return { height: targetRect.height, width: targetRect.width };
  }

  var root = document.documentElement;
  var shiftX = Math.max(0, command.paddingCss - targetRect.left);
  var shiftY = Math.max(0, command.paddingCss - targetRect.top);
  if (shiftX > 0 || shiftY > 0) {
    root.setAttribute(
      'data-agent-capture-original-styles',
      JSON.stringify({
        transform: root.style.transform,
        transformOrigin: root.style.transformOrigin,
        translate: root.style.translate,
      }),
    );
    root.style.transformOrigin = '0 0';
    root.style.translate = shiftX + 'px ' + shiftY + 'px';
  }

  var shiftedRect = target.getBoundingClientRect();
  var scrollX = window.scrollX;
  var scrollY = window.scrollY;

  var markerHost = document.createElement('div');
  markerHost.setAttribute('data-agent-capture-token', command.token);
  markerHost.setAttribute('aria-hidden', 'true');
  markerHost.style.cssText = 'all:initial;display:block;pointer-events:none;position:absolute;z-index:2147483646;';

  var outline = document.createElement('div');
  outline.style.cssText = [
    'background:transparent',
    'box-shadow:0 0 0 ' + command.paddingCss + 'px #fff',
    'height:' + shiftedRect.height + 'px',
    'left:' + (shiftedRect.left + scrollX) + 'px',
    'pointer-events:none',
    'position:absolute',
    'top:' + (shiftedRect.top + scrollY) + 'px',
    'width:' + shiftedRect.width + 'px',
    'z-index:2147483646',
  ].join(';');
  markerHost.appendChild(outline);

  var interactive = Array.from(target.querySelectorAll(INTERACTIVE));
  if (target.matches(INTERACTIVE)) interactive.unshift(target);

  var map = [];
  var index = 0;
  for (var j = 0; j < interactive.length; j++) {
    var el = interactive[j];
    if (!isVisible(el)) continue;
    var rect = el.getBoundingClientRect();
    var badge = document.createElement('span');
    badge.textContent = String(index);
    badge.style.cssText = [
      'align-items:center',
      'background:#dc2626',
      'border:1px solid #fff',
      'border-radius:999px',
      'box-sizing:border-box',
      'color:#fff',
      'display:flex',
      'font:700 10px/1 Arial,sans-serif',
      'height:16px',
      'justify-content:center',
      'left:' + (rect.left + scrollX - 6) + 'px',
      'min-width:16px',
      'padding:0 3px',
      'pointer-events:none',
      'position:absolute',
      'top:' + (rect.top + scrollY - 6) + 'px',
      'z-index:2147483647',
    ].join(';');
    markerHost.appendChild(badge);

    var outputX = Math.round((rect.left - shiftedRect.left + command.paddingCss) * command.scale);
    var outputY = Math.round((rect.top - shiftedRect.top + command.paddingCss) * command.scale);
    var outputWidth = Math.round(rect.width * command.scale);
    var outputHeight = Math.round(rect.height * command.scale);
    map.push(
      index + ' ' + captureRole(el) + ' "' + captureName(el) + '" state=' + captureState(el) +
      ' xpath=' + captureXPath(el) +
      ' target=' + Math.round(rect.left - shiftedRect.left) + ',' + Math.round(rect.top - shiftedRect.top) +
      ' ' + Math.round(rect.width) + 'x' + Math.round(rect.height) +
      ' output=' + outputX + ',' + outputY + ' ' + outputWidth + 'x' + outputHeight,
    );
    index++;
  }

  if (document.body) document.body.appendChild(markerHost);

  return {
    clip: {
      height: shiftedRect.height + command.paddingCss * 2,
      scale: command.scale,
      width: shiftedRect.width + command.paddingCss * 2,
      x: shiftedRect.left + scrollX - command.paddingCss,
      y: shiftedRect.top + scrollY - command.paddingCss,
    },
    elementMap: map.join('\n'),
  };
}
`

const CAPTURE_READY_SCRIPT = String.raw`
(function () {
  function ready() {
    var fonts = document.fonts;
    var fontReady = fonts && fonts.ready ? fonts.ready : Promise.resolve();
    var imagesReady = fontReady.then(function () {
      return Promise.all(
        Array.from(document.images).map(function (image) {
          if (image.complete) return Promise.resolve();
          return new Promise(function (resolve) {
            image.addEventListener('error', resolve, { once: true });
            image.addEventListener('load', resolve, { once: true });
          });
        }),
      );
    });
    var deadline = new Promise(function (resolve) { setTimeout(resolve, 3000); });
    return Promise.race([imagesReady, deadline]);
  }
  return ready();
})()
`

function assertNoCaptureError<T>(
  result: CaptureError | T,
  selector: string,
): asserts result is T {
  if (result && typeof result === 'object' && 'error' in result) {
    throw new ProjectScreenshotCaptureError(
      (result as CaptureError).error ||
        `Screenshot target "${selector}" failed.`,
    )
  }
}

async function awaitWithinDeadline<T>(
  promise: Promise<T>,
  deadline: number,
  now: () => number,
  signal?: AbortSignal,
): Promise<T> {
  throwIfAborted(signal)
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => {
        cleanup()
        reject(
          new ProjectScreenshotCaptureError(
            'Cloudflare Browser Run capture timed out.',
          ),
        )
      },
      remainingMs(deadline, now),
    )
    const onAbort = () => {
      cleanup()
      reject(
        new ProjectScreenshotCaptureError('Screenshot capture was stopped.'),
      )
    }
    const cleanup = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        cleanup()
        resolve(value)
      },
      (error: unknown) => {
        cleanup()
        reject(error)
      },
    )
  })
}

async function closeQuietly(
  resource: undefined | { close: () => Promise<void> },
): Promise<void> {
  try {
    await resource?.close()
  } catch {
    // Provider cleanup cannot obscure the capture result/error.
  }
}

/** Extract the Cloudflare-provided detail from a raw connect/CDP error for
 *  diagnostics. Returns '' when no useful substring is found. Never includes
 *  credentials or authorization headers (those are not in error messages). */
function cloudflareErrorDetail(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  const match = message.match(/(?:code|message)[:\s]+([^.\n]+)/i)
  return match?.[1]?.trim() ?? ''
}

function defaultConnectOverCDP(
  endpoint: string,
  options: BrowserConnectorOptions,
): Promise<Browser> {
  return chromium.connectOverCDP(endpoint, options)
}

function isDailyLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return /time limit exceeded|daily limit/.test(message)
}

function isRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return /429|rate limit|too many/.test(message)
}

function isRetryableConnectionError(error: unknown): boolean {
  return (
    isRateLimitError(error) ||
    (() => {
      const message = error instanceof Error ? error.message.toLowerCase() : ''
      return /econn|socket|network|timed out|timeout|closed/.test(message)
    })()
  )
}

function normalizeCaptureError(
  error: unknown,
  signal?: AbortSignal,
): ProjectScreenshotCaptureError {
  if (error instanceof ProjectScreenshotCaptureError) return error
  if (signal?.aborted) {
    return new ProjectScreenshotCaptureError('Screenshot capture was stopped.')
  }
  const detail = cloudflareErrorDetail(error)
  if (isDailyLimitError(error)) {
    return new ProjectScreenshotCaptureError(
      'Cloudflare Browser Run daily browser-time limit reached (Free plan: 10 min/day). If you recently upgraded to Workers Paid, verify the plan is active for this account and token.',
    )
  }
  if (isRateLimitError(error)) {
    const suffix = detail ? ` (${detail})` : ''
    return new ProjectScreenshotCaptureError(
      `Cloudflare Browser Run is rate limited. Try again shortly${suffix}.`,
    )
  }
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (/401|403|unauthori[sz]ed|forbidden/.test(message)) {
    return new ProjectScreenshotCaptureError(
      'Cloudflare Browser Run authentication failed. Check Browser Rendering - Edit credentials.',
    )
  }
  if (/timeout|timed out/.test(message)) {
    return new ProjectScreenshotCaptureError(
      'Cloudflare Browser Run capture timed out.',
    )
  }
  return new ProjectScreenshotCaptureError(
    'Cloudflare Browser Run capture failed.',
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

function remainingMs(deadline: number, now: () => number): number {
  const remaining = Math.floor(deadline - now())
  if (remaining <= 0) {
    throw new ProjectScreenshotCaptureError(
      'Cloudflare Browser Run capture timed out.',
    )
  }
  return remaining
}

function screenshotData(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ProjectScreenshotCaptureError(
      'Cloudflare Browser Run returned an invalid screenshot response.',
    )
  }
  const data = (value as Record<string, unknown>).data
  if (typeof data !== 'string' || data.length === 0) {
    throw new ProjectScreenshotCaptureError(
      'Cloudflare Browser Run returned an empty screenshot.',
    )
  }
  return data
}

async function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      resolve()
    }, ms)
    const onAbort = () => {
      cleanup()
      reject(
        new ProjectScreenshotCaptureError('Screenshot capture was stopped.'),
      )
    }
    const cleanup = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new ProjectScreenshotCaptureError('Screenshot capture was stopped.')
  }
}
