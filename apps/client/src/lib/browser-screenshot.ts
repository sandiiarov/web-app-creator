import { snapdom } from '@zumer/snapdom'

import {
  type ScreenshotResponseInput,
  type ScreenshotViewportSize,
} from './landing-agent'

export interface CaptureProjectScreenshotInput {
  html: string
  selector: string
  viewportSize: ScreenshotViewportSize
}

type ScreenshotCapture = Exclude<ScreenshotResponseInput, { error: string }>

export const ELEMENT_CAPTURE_PADDING_PX = 8

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

    const target = queryScreenshotTarget(doc, selector)
    const targetSize = getElementScreenshotSize(target)
    const paddedSize = getPaddedScreenshotSize(targetSize)
    ensureSupportedScreenshotSize(paddedSize)

    const blob = await snapdom.toBlob(target, {
      backgroundColor: CAPTURE_BACKGROUND,
      dpr: 1,
      height: targetSize.height,
      quality: CAPTURE_QUALITY,
      type: 'jpeg',
      width: targetSize.width,
    })
    const dataUrl = await createPaddedDataUrl(blob, targetSize, paddedSize)

    return {
      dataUrl,
      height: paddedSize.height,
      mediaType: 'image/jpeg',
      width: paddedSize.width,
    }
  } finally {
    iframe.remove()
  }
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
): Promise<string> {
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

  return canvas.toDataURL('image/jpeg', CAPTURE_QUALITY)
}

function ensureSupportedScreenshotSize(size: {
  height: number
  width: number
}) {
  if (
    size.width > MAX_SCREENSHOT_DIMENSION ||
    size.height > MAX_SCREENSHOT_DIMENSION
  ) {
    throw new Error(
      `Selected element screenshot is too large (${size.width}×${size.height}). Choose a smaller selector.`,
    )
  }
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
