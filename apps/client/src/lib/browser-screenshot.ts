import { snapdom } from '@zumer/snapdom'

import { type ScreenshotResponseInput } from './landing-agent'

export interface CaptureProjectScreenshotInput {
  height: number
  html: string
  width: number
}

type ScreenshotCapture = Exclude<ScreenshotResponseInput, { error: string }>

const CAPTURE_BACKGROUND = '#ffffff'
const CAPTURE_QUALITY = 0.9
const IFRAME_LOAD_TIMEOUT_MS = 5_000
const RESOURCE_WAIT_TIMEOUT_MS = 3_000

export async function captureProjectScreenshot({
  height,
  html,
  width,
}: CaptureProjectScreenshotInput): Promise<ScreenshotCapture> {
  const iframe = document.createElement('iframe')

  iframe.setAttribute('aria-hidden', 'true')
  iframe.setAttribute('sandbox', 'allow-same-origin')
  iframe.style.border = '0'
  iframe.style.height = `${height}px`
  iframe.style.left = '-100000px'
  iframe.style.opacity = '0'
  iframe.style.pointerEvents = 'none'
  iframe.style.position = 'fixed'
  iframe.style.top = '0'
  iframe.style.width = `${width}px`
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

    const blob = await snapdom.toBlob(doc.documentElement, {
      backgroundColor: CAPTURE_BACKGROUND,
      dpr: 1,
      height,
      quality: CAPTURE_QUALITY,
      type: 'jpeg',
      width,
    })
    const dataUrl = await blobToDataUrl(blob)

    return {
      dataUrl,
      height,
      mediaType: 'image/jpeg',
      width,
    }
  } finally {
    iframe.remove()
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed to encode screenshot.'))
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Failed to encode screenshot.'))
    }
    reader.readAsDataURL(blob)
  })
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
