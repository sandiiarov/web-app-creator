import type { ScreenshotMediaType } from '@workspace/prompt-panel'
import { type CaptureResult, snapdom } from '@zumer/snapdom'

import {
  agentMap,
  type AgentMapEntry,
  type AgentMapResult,
} from './agent-map-plugin.ts'

export interface CaptureProjectScreenshotInput {
  html: string
  selector: string
  viewportSize: ScreenshotViewportSize
}

export const ELEMENT_CAPTURE_PADDING_PX = 8
export const SCREENSHOT_CAPTURE_SCALE = 0.5

export type ElementScreenshotCapture = ScreenshotCapture & { size: number }

export const SCREENSHOT_VIEWPORT_SIZES = [
  'mobile',
  'tablet',
  'desktop',
] as const

export type { ScreenshotMediaType }

export type ScreenshotCapture = Exclude<
  ScreenshotResponseInput,
  { error: string }
>

export type ScreenshotResponseInput =
  | {
      dataUrl: string
      /** Set-of-Marks element map (one line per interactive element); '' when empty. */
      elementMap: string
      height: number
      mediaType: ScreenshotMediaType
      width: number
    }
  | { error: string }

export type ScreenshotViewportSize = (typeof SCREENSHOT_VIEWPORT_SIZES)[number]

const CAPTURE_BACKGROUND = '#ffffff'
const CAPTURE_QUALITY = 0.9
const IFRAME_LOAD_TIMEOUT_MS = 5_000
const MAX_SCREENSHOT_DIMENSION = 4096
const RESOURCE_WAIT_TIMEOUT_MS = 3_000

const SCREENSHOT_VIEWPORT_DIMENSIONS: Record<
  ScreenshotViewportSize,
  { height: number; width: number }
> = {
  desktop: { height: 900, width: 1440 },
  mobile: { height: 844, width: 390 },
  tablet: { height: 1024, width: 768 },
}

export async function captureElementScreenshot(
  target: Element,
): Promise<ElementScreenshotCapture> {
  const fullSize = getElementScreenshotSize(target)
  const { paddedSize, targetSize } = fitScreenshotSize(fullSize)

  // Instance snapdom form so the agent-map plugin's exports surface on the
  // result. image:'annotated' draws numbered badges on the shared clone (so
  // the OCR image carries them) and extracts the Set-of-Marks map in afterClone.
  const result = await snapdom(target, {
    backgroundColor: CAPTURE_BACKGROUND,
    dpr: 1,
    height: targetSize.height,
    plugins: [agentMap({ fields: 'minimal', image: 'annotated' })],
    width: targetSize.width,
  })

  const blob = await result.toBlob({
    quality: CAPTURE_QUALITY,
    type: 'jpeg',
  })
  const { dataUrl, size } = await createPaddedDataUrl(
    blob,
    targetSize,
    paddedSize,
  )

  const elementMap = await readElementMap(result)

  return {
    dataUrl,
    elementMap,
    height: paddedSize.height,
    mediaType: 'image/jpeg',
    size,
    width: paddedSize.width,
  }
}

export async function captureProjectScreenshot({
  html,
  selector,
  viewportSize,
}: CaptureProjectScreenshotInput): Promise<ScreenshotCapture> {
  const viewport = getScreenshotViewportDimensions(viewportSize)
  const iframe = document.createElement('iframe')

  iframe.setAttribute('aria-hidden', 'true')
  iframe.setAttribute('sandbox', 'allow-same-origin')
  iframe.style.border = '0'
  iframe.style.height = `${viewport.height}px`
  iframe.style.left = '-100000px'
  iframe.style.opacity = '0'
  iframe.style.pointerEvents = 'none'
  iframe.style.position = 'fixed'
  iframe.style.top = '0'
  iframe.style.width = `${viewport.width}px`
  iframe.style.zIndex = '-1'

  document.body.appendChild(iframe)

  try {
    const loaded = waitForIframeLoad(iframe, IFRAME_LOAD_TIMEOUT_MS)
    iframe.srcdoc = html
    await loaded

    const doc = iframe.contentDocument
    if (!doc?.documentElement) {
      throw new Error('Screenshot iframe did not load a document.')
    }

    await waitForResources(doc, RESOURCE_WAIT_TIMEOUT_MS)

    return await captureElementScreenshot(queryScreenshotTarget(doc, selector))
  } finally {
    iframe.remove()
  }
}

/**
 * Render screenshots at half the element's CSS dimensions, then enforce
 * MAX_SCREENSHOT_DIMENSION for exceptionally large elements. Both reductions
 * preserve aspect ratio so OCR receives fewer pixels without layout reflow.
 */
export function fitScreenshotSize(targetSize: {
  height: number
  width: number
}): {
  paddedSize: { height: number; width: number }
  targetSize: { height: number; width: number }
} {
  // Scale against the target dim (cap minus padding) so the padded result
  // stays within MAX_SCREENSHOT_DIMENSION. Half-resolution is the normal path;
  // exceptionally large elements receive the stricter cap-derived scale.
  const maxTarget = MAX_SCREENSHOT_DIMENSION - ELEMENT_CAPTURE_PADDING_PX * 2
  const longest = Math.max(targetSize.width, targetSize.height)
  const scale = Math.min(SCREENSHOT_CAPTURE_SCALE, maxTarget / longest)
  const scaledTarget = {
    height: Math.max(1, Math.floor(targetSize.height * scale)),
    width: Math.max(1, Math.floor(targetSize.width * scale)),
  }
  return {
    paddedSize: getPaddedScreenshotSize(scaledTarget),
    targetSize: scaledTarget,
  }
}

/**
 * Format a Set-of-Marks entry list as `<i> <role> "<name>" @x,y w×h [state]`,
 * one per line. Empty/missing map → ''. Bounding boxes are relative to the
 * captured root (agent spatial grounding; the model receives the OCR transcript,
 * not the raw image, so absolute scale is informational).
 */
export function formatElementMap(map: AgentMapEntry[] | undefined): string {
  if (!map || map.length === 0) return ''
  return map.map(formatElementMapEntry).join('\n')
}

export function getPaddedScreenshotSize(
  size: { height: number; width: number },
  padding = ELEMENT_CAPTURE_PADDING_PX,
) {
  return {
    height: size.height + padding * 2,
    width: size.width + padding * 2,
  }
}

export function getScreenshotViewportDimensions(
  viewportSize: ScreenshotViewportSize,
) {
  return SCREENSHOT_VIEWPORT_DIMENSIONS[viewportSize]
}

async function createPaddedDataUrl(
  blob: Blob,
  targetSize: { height: number; width: number },
  paddedSize: { height: number; width: number },
): Promise<{ dataUrl: string; size: number }> {
  const image = await loadImage(blob)
  const canvas = document.createElement('canvas')
  canvas.height = paddedSize.height
  canvas.width = paddedSize.width

  const context = canvas.getContext('2d')
  if (!context) throw new Error('Failed to prepare screenshot canvas.')

  context.fillStyle = CAPTURE_BACKGROUND
  context.fillRect(0, 0, paddedSize.width, paddedSize.height)
  context.drawImage(
    image,
    ELEMENT_CAPTURE_PADDING_PX,
    ELEMENT_CAPTURE_PADDING_PX,
    targetSize.width,
    targetSize.height,
  )

  const dataUrl = canvas.toDataURL('image/jpeg', CAPTURE_QUALITY)
  return { dataUrl, size: dataUrlByteSize(dataUrl) }
}

function dataUrlByteSize(dataUrl: string) {
  const base64 = dataUrl.split(',', 2)[1] ?? ''
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding)
}

function formatElementMapEntry(entry: AgentMapEntry): string {
  const [x, y, width, height] = entry.b
  const name = entry.n ? ` "${entry.n}"` : ''
  const state = entry.s
    ? ` ${Object.entries(entry.s)
        .map(([key, value]) => `${key}=${formatStateValue(value)}`)
        .join(' ')}`
    : ''
  return `${entry.i} ${entry.r}${name} @${x},${y} ${width}×${height}${state}`
}

function formatStateValue(value: unknown): string {
  return typeof value === 'string' ? value : String(value)
}

function getElementScreenshotSize(element: Element) {
  const rect = element.getBoundingClientRect()
  const height = Math.ceil(rect.height)
  const width = Math.ceil(rect.width)

  if (height <= 0 || width <= 0) {
    throw new Error('Selected screenshot element has no visible size.')
  }

  return { height, width }
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const url = URL.createObjectURL(blob)

    function cleanup() {
      URL.revokeObjectURL(url)
      image.removeEventListener('error', handleError)
      image.removeEventListener('load', handleLoad)
    }

    function handleError() {
      cleanup()
      reject(new Error('Failed to decode screenshot.'))
    }

    function handleLoad() {
      cleanup()
      resolve(image)
    }

    image.addEventListener('error', handleError, { once: true })
    image.addEventListener('load', handleLoad, { once: true })
    image.src = url
  })
}

function queryScreenshotTarget(doc: Document, selector: string): Element {
  let target: Element | null
  try {
    target = doc.querySelector(selector)
  } catch {
    throw new Error(`Invalid screenshot selector: ${selector}`)
  }

  if (!target) {
    throw new Error(`Screenshot selector did not match an element: ${selector}`)
  }

  return target
}

/**
 * Read the agent-map Set-of-Marks from a snapdom capture result and format it
 * as a compact one-line-per-element string. Returns '' when the plugin did not
 * attach its export or produced no entries. Never throws — a missing map must
 * not fail the screenshot (the OCR transcript is still valuable).
 */
async function readElementMap(result: CaptureResult): Promise<string> {
  const toAgentMap = result.toAgentMap as
    | ((opts?: { image?: false }) => Promise<AgentMapResult>)
    | undefined
  if (typeof toAgentMap !== 'function') return ''
  try {
    const { map } = await toAgentMap({ image: false })
    return formatElementMap(map)
  } catch {
    return ''
  }
}

async function waitForFonts(doc: Document) {
  const fonts = doc.fonts
  if (!fonts) return
  await fonts.ready.catch(() => undefined)
}

function waitForIframeLoad(
  iframe: HTMLIFrameElement,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error('Screenshot iframe load timed out.'))
    }, timeoutMs)

    function cleanup() {
      window.clearTimeout(timeout)
      iframe.removeEventListener('error', handleError)
      iframe.removeEventListener('load', handleLoad)
    }

    function handleError() {
      cleanup()
      reject(new Error('Screenshot iframe failed to load.'))
    }

    function handleLoad() {
      cleanup()
      resolve()
    }

    iframe.addEventListener('error', handleError, { once: true })
    iframe.addEventListener('load', handleLoad, { once: true })
  })
}

function waitForImage(
  image: HTMLImageElement,
  timeoutMs: number,
): Promise<void> {
  if (image.complete) return Promise.resolve()

  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      cleanup()
      resolve()
    }, timeoutMs)

    function cleanup() {
      window.clearTimeout(timeout)
      image.removeEventListener('error', handleDone)
      image.removeEventListener('load', handleDone)
    }

    function handleDone() {
      cleanup()
      resolve()
    }

    image.addEventListener('error', handleDone, { once: true })
    image.addEventListener('load', handleDone, { once: true })
  })
}

async function waitForResources(doc: Document, timeoutMs: number) {
  await Promise.all([
    waitForFonts(doc),
    ...Array.from(doc.images).map((image) => waitForImage(image, timeoutMs)),
  ])
}
