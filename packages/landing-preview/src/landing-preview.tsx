import type { ElementAttachmentMeta } from '@workspace/prompt-panel'
import {
  type Ref,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'

import {
  captureElementScreenshot,
  type ElementScreenshotCapture,
} from './browser-screenshot'
import {
  morphPreviewDocument,
  preparePreviewMorphHtml,
  shouldRerunScriptsAfterMorph,
} from './preview-morph'

export interface LandingPreviewHandle {
  captureScreenshot(
    input: LandingPreviewScreenshotInput,
  ): Promise<ElementScreenshotCapture>
  isReady(): boolean
}

export type LandingPreviewProps = {
  elementSelectionActive?: boolean
  html: string
  iframeClassName?: string
  onElementSelected?: (attachment: ElementAttachmentMeta) => void
  onElementSelectionCancel?: () => void
  onError?: (message: string) => void
  onPreviewDiagnostic?: (diagnostic: PreviewDiagnostic) => void
  ref?: Ref<LandingPreviewHandle>
}

export interface LandingPreviewScreenshotInput {
  selector?: string
}

export interface PreviewConsoleDiagnostic {
  at: number
  kind: 'console'
  level: PreviewConsoleLevel
  message: string
}

export type PreviewConsoleLevel = 'debug' | 'error' | 'info' | 'log' | 'warn'

export type PreviewDiagnostic =
  | PreviewConsoleDiagnostic
  | PreviewErrorDiagnostic
  | PreviewLoadDiagnostic
  | PreviewReadyDiagnostic

export interface PreviewErrorDiagnostic {
  at: number
  colno?: number
  kind: 'error'
  lineno?: number
  message: string
  source?: string
}

export type PreviewLoadDiagnostic = { at: number; kind: 'load' }

export type PreviewReadyDiagnostic = { at: number; kind: 'ready' }

const ELEMENT_PICKER_ACTIVE_ATTR = 'data-landing-element-picker-active'
const ELEMENT_PICKER_LERP_FACTOR = 0.32
const ELEMENT_PICKER_MIN_DELTA_PX = 0.25
const ELEMENT_PICKER_OVERLAY_ATTR = 'data-landing-element-picker-overlay'
const ELEMENT_PICKER_STYLE_ID = 'landing-element-picker-style'
const ELEMENT_PICKER_Z_INDEX = 2147483647

const NON_SELECTABLE_PICKER_TAGS = new Set([
  'base',
  'body',
  'head',
  'html',
  'link',
  'meta',
  'noscript',
  'script',
  'style',
  'title',
])

type ElementPickerOverlay = {
  destroy: () => void
  hide: () => void
  setTarget: (element: Element | null, state?: PickerOverlayState) => void
  update: () => void
}

type PickerBounds = {
  borderRadius: string
  height: number
  width: number
  x: number
  y: number
}

type PickerOverlayState = 'hover' | 'selected'

/**
 * Build a stable CSS selector that round-trips to exactly this element via
 * `document.querySelector`. Prefers a unique escaped id; otherwise builds an
 * escaped `tag:nth-of-type(n)` ancestry path and verifies uniqueness.
 */
export function buildStableSelector(doc: Document, element: Element): string {
  if (
    element.id &&
    doc.querySelector(`#${CSS.escape(element.id)}`) === element
  ) {
    return `#${CSS.escape(element.id)}`
  }

  const path: string[] = []
  let current: Element | null = element
  while (current && current !== doc.documentElement) {
    const tag = current.tagName.toLowerCase()
    const parent: Element | null = current.parentElement
    if (!parent) {
      path.unshift(tag)
      break
    }
    const currentTag = current.tagName
    const siblings = Array.from(parent.children).filter(
      (sibling: Element) => sibling.tagName === currentTag,
    )
    if (siblings.length === 1) {
      path.unshift(tag)
    } else {
      const index = siblings.indexOf(current) + 1
      path.unshift(`${tag}:nth-of-type(${index})`)
    }
    current = parent
  }

  if (current === doc.documentElement && path[0] !== 'html') {
    path.unshift('html')
  }

  const selector = path.join(' > ')
  // Verify round-trip uniqueness.
  if (doc.querySelector(selector) === element) return selector

  // Last resort: return the escaped outerHTML tag fallback.
  return CSS.escape(element.tagName.toLowerCase())
}

export function LandingPreview({
  elementSelectionActive = false,
  html,
  iframeClassName,
  onElementSelected,
  onElementSelectionCancel,
  onError,
  onPreviewDiagnostic,
  ref,
}: LandingPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const lastAppliedHtmlRef = useRef('')
  const [srcDoc, setSrcDoc] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  const handle: LandingPreviewHandle = {
    captureScreenshot: async ({ selector }: LandingPreviewScreenshotInput) => {
      const doc = iframeRef.current?.contentDocument
      if (!doc?.documentElement) {
        throw new Error('Landing preview is not ready for capture.')
      }
      const target = selector
        ? (doc.querySelector(selector) ?? null)
        : (doc.body ?? doc.documentElement)
      if (!target) {
        throw new Error(
          selector
            ? `Screenshot selector did not match an element: ${selector}`
            : 'Screenshot target has no document body.',
        )
      }
      return captureElementScreenshot(target)
    },
    isReady: () => Boolean(iframeRef.current?.contentDocument?.documentElement),
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- handle methods read iframeRef lazily; deps intentionally empty.
  useImperativeHandle(ref, () => handle, [])

  useEffect(() => {
    if (!html.trim()) {
      lastAppliedHtmlRef.current = ''
      setSrcDoc('')
      return
    }

    function reloadPreview() {
      lastAppliedHtmlRef.current = html
      setSrcDoc(preparePreviewMorphHtml(html))
      setReloadKey((key) => key + 1)
    }

    if (!lastAppliedHtmlRef.current) {
      reloadPreview()
      return
    }
    if (lastAppliedHtmlRef.current === html) return

    function morphCurrentPreview() {
      const previousHtml = lastAppliedHtmlRef.current
      if (!previousHtml || previousHtml === html) return true

      const doc = iframeRef.current?.contentDocument
      if (!doc?.documentElement || doc.readyState === 'loading') return false

      try {
        morphPreviewDocument(doc, html, {
          rerunScripts: shouldRerunScriptsAfterMorph(previousHtml, html),
        })
        lastAppliedHtmlRef.current = html
        return true
      } catch {
        reloadPreview()
        return true
      }
    }

    if (morphCurrentPreview()) return

    const iframe = iframeRef.current
    if (!iframe) {
      reloadPreview()
      return
    }

    let cancelled = false
    const tryMorphAfterReady = () => {
      if (cancelled || lastAppliedHtmlRef.current === html) return
      const doc = iframe.contentDocument
      if (!doc?.documentElement || doc.readyState === 'loading') return
      morphCurrentPreview()
    }

    iframe.addEventListener('load', tryMorphAfterReady, { once: true })
    const frameId = window.requestAnimationFrame(tryMorphAfterReady)

    return () => {
      cancelled = true
      window.cancelAnimationFrame(frameId)
      iframe.removeEventListener('load', tryMorphAfterReady)
    }
  }, [html])

  useEffect(() => {
    if (!elementSelectionActive || !onElementSelected) return

    const iframe = iframeRef.current
    let cleanupPicker: (() => void) | undefined
    let cancelled = false

    const attachPicker = () => {
      if (cancelled || cleanupPicker) return
      const doc = iframe?.contentDocument
      if (!doc?.documentElement || doc.readyState === 'loading') return
      cleanupPicker = installElementPicker(
        doc,
        onElementSelected,
        onElementSelectionCancel,
        onError,
      )
    }

    attachPicker()
    iframe?.addEventListener('load', attachPicker)
    const frameId = window.requestAnimationFrame(attachPicker)

    return () => {
      cancelled = true
      window.cancelAnimationFrame(frameId)
      iframe?.removeEventListener('load', attachPicker)
      cleanupPicker?.()
    }
  }, [
    elementSelectionActive,
    html,
    onElementSelected,
    onElementSelectionCancel,
    onError,
  ])

  useEffect(() => {
    if (!elementSelectionActive || !onElementSelectionCancel) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onElementSelectionCancel()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [elementSelectionActive, onElementSelectionCancel])

  useEffect(() => {
    if (!onPreviewDiagnostic) return
    const iframe = iframeRef.current
    if (!iframe) return
    let cancelled = false
    let detach: (() => void) | undefined

    const emit = (diagnostic: PreviewDiagnostic) => {
      if (!cancelled) onPreviewDiagnostic(diagnostic)
    }

    const handleLoad = () => {
      emit({ at: Date.now(), kind: 'load' })
      const win = iframe.contentWindow
      const doc = iframe.contentDocument
      if (!win || !doc) return
      emit({ at: Date.now(), kind: 'ready' })

      const handleError = (event: ErrorEvent) => {
        emit({
          at: Date.now(),
          colno: event.colno,
          kind: 'error',
          lineno: event.lineno,
          message: event.message || 'Preview runtime error.',
          source: event.filename,
        })
      }
      const handleRejection = (event: PromiseRejectionEvent) => {
        const reason = event.reason
        const message =
          reason instanceof Error ? reason.message : String(reason)
        emit({ at: Date.now(), kind: 'error', message })
      }

      win.addEventListener('error', handleError)
      win.addEventListener('unhandledrejection', handleRejection)
      detach = () => {
        win.removeEventListener('error', handleError)
        win.removeEventListener('unhandledrejection', handleRejection)
      }
    }

    iframe.addEventListener('load', handleLoad)
    return () => {
      cancelled = true
      iframe.removeEventListener('load', handleLoad)
      detach?.()
    }
  }, [html, onPreviewDiagnostic])

  if (!html.trim()) {
    return (
      <LandingEmptyState
        className={iframeClassName ?? 'h-svh w-screen border-0'}
      />
    )
  }

  return (
    <iframe
      className={iframeClassName ?? 'h-svh w-screen border-0'}
      key={reloadKey}
      ref={iframeRef}
      referrerPolicy="no-referrer"
      sandbox="allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
      srcDoc={srcDoc}
      title="Landing page preview"
    />
  )
}

function createAttachmentId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `element-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function createElementAttachment(
  doc: Document,
  element: Element,
): ElementAttachmentMeta {
  const selector = buildStableSelector(doc, element)
  const label = elementLabel(element)
  return {
    id: createAttachmentId(),
    kind: 'element',
    name: `Element ${label}`,
    selector,
  }
}

function createElementPickerOverlay(doc: Document): ElementPickerOverlay {
  const overlay = doc.createElement('div')
  const overlayWindow = doc.defaultView ?? window
  let animationFrame: null | number = null
  let currentBounds: null | PickerBounds = null
  let targetBounds: null | PickerBounds = null
  let targetElement: Element | null = null

  overlay.setAttribute(ELEMENT_PICKER_OVERLAY_ATTR, 'true')
  overlay.dataset.state = 'hover'
  overlay.dataset.visible = 'false'
  doc.documentElement.appendChild(overlay)

  const applyBounds = (bounds: PickerBounds) => {
    overlay.style.borderRadius = bounds.borderRadius
    overlay.style.height = `${bounds.height}px`
    overlay.style.transform = `translate3d(${bounds.x}px, ${bounds.y}px, 0)`
    overlay.style.width = `${bounds.width}px`
  }

  const cancelAnimation = () => {
    if (animationFrame === null) return
    overlayWindow.cancelAnimationFrame(animationFrame)
    animationFrame = null
  }

  const hide = () => {
    cancelAnimation()
    currentBounds = null
    targetBounds = null
    targetElement = null
    overlay.dataset.visible = 'false'
  }

  const tick = () => {
    animationFrame = null
    if (!currentBounds || !targetBounds) return

    const nextBounds = {
      borderRadius: targetBounds.borderRadius,
      height:
        currentBounds.height +
        (targetBounds.height - currentBounds.height) *
          ELEMENT_PICKER_LERP_FACTOR,
      width:
        currentBounds.width +
        (targetBounds.width - currentBounds.width) * ELEMENT_PICKER_LERP_FACTOR,
      x:
        currentBounds.x +
        (targetBounds.x - currentBounds.x) * ELEMENT_PICKER_LERP_FACTOR,
      y:
        currentBounds.y +
        (targetBounds.y - currentBounds.y) * ELEMENT_PICKER_LERP_FACTOR,
    }

    const isSettled =
      Math.abs(nextBounds.height - targetBounds.height) <
        ELEMENT_PICKER_MIN_DELTA_PX &&
      Math.abs(nextBounds.width - targetBounds.width) <
        ELEMENT_PICKER_MIN_DELTA_PX &&
      Math.abs(nextBounds.x - targetBounds.x) < ELEMENT_PICKER_MIN_DELTA_PX &&
      Math.abs(nextBounds.y - targetBounds.y) < ELEMENT_PICKER_MIN_DELTA_PX

    currentBounds = isSettled ? targetBounds : nextBounds
    applyBounds(currentBounds)

    if (!isSettled) {
      animationFrame = overlayWindow.requestAnimationFrame(tick)
    }
  }

  const setTarget = (
    element: Element | null,
    state: PickerOverlayState = 'hover',
  ) => {
    if (!element || !isSelectableElement(doc, element)) {
      hide()
      return
    }

    const bounds = createPickerBounds(element)
    if (!bounds) {
      hide()
      return
    }

    targetElement = element
    targetBounds = bounds
    currentBounds ??= bounds
    overlay.dataset.state = state
    overlay.dataset.visible = 'true'
    applyBounds(currentBounds)

    if (animationFrame === null) {
      animationFrame = overlayWindow.requestAnimationFrame(tick)
    }
  }

  return {
    destroy: () => {
      cancelAnimation()
      overlay.remove()
    },
    hide,
    setTarget,
    update: () => {
      if (!targetElement || !doc.contains(targetElement)) {
        hide()
        return
      }

      setTarget(
        targetElement,
        overlay.dataset.state === 'selected' ? 'selected' : 'hover',
      )
    },
  }
}

function createPickerBounds(element: Element): null | PickerBounds {
  const rect = element.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null

  const view = element.ownerDocument.defaultView ?? window
  const style = view.getComputedStyle(element)

  return {
    borderRadius: style.borderRadius || '0px',
    height: rect.height,
    width: rect.width,
    x: rect.left,
    y: rect.top,
  }
}

function elementLabel(element: Element) {
  const classSeparator = String.fromCharCode(46)
  const tag = element.tagName.toLowerCase()
  const id = element.id ? `#${element.id}` : ''
  const className = Array.from(element.classList)
    .slice(0, 2)
    .join(classSeparator)
  const classes = className ? `${classSeparator}${className}` : ''
  return `${tag}${id}${classes}`
}

function ensurePickerStyle(doc: Document) {
  let style = doc.getElementById(ELEMENT_PICKER_STYLE_ID)
  if (style) return

  const accent = getComputedStyle(document.documentElement)
    .getPropertyValue('--primary')
    .trim()
  const accentColor = accent || 'oklch(0.681 0.162 75.834)'

  style = doc.createElement('style')
  style.id = ELEMENT_PICKER_STYLE_ID
  style.textContent = `
    html[${ELEMENT_PICKER_ACTIVE_ATTR}="true"],
    html[${ELEMENT_PICKER_ACTIVE_ATTR}="true"] * {
      cursor: crosshair !important;
      user-select: none !important;
    }

    [${ELEMENT_PICKER_OVERLAY_ATTR}] {
      background: rgba(255, 214, 10, 0.16) !important;
      background: color-mix(in oklch, ${accentColor} 16%, transparent) !important;
      border: 2px dashed ${accentColor} !important;
      box-shadow:
        0 0 0 1px color-mix(in oklch, ${accentColor} 30%, transparent),
        0 10px 30px color-mix(in oklch, ${accentColor} 18%, transparent) !important;
      box-sizing: border-box !important;
      left: 0 !important;
      opacity: 0;
      pointer-events: none !important;
      position: fixed !important;
      top: 0 !important;
      transition: opacity 80ms ease-out;
      z-index: ${ELEMENT_PICKER_Z_INDEX} !important;
      will-change: border-radius, height, opacity, transform, width;
    }

    [${ELEMENT_PICKER_OVERLAY_ATTR}][data-visible="true"] {
      opacity: 1;
    }

    [${ELEMENT_PICKER_OVERLAY_ATTR}][data-state="selected"] {
      background: rgba(255, 214, 10, 0.24) !important;
      background: color-mix(in oklch, ${accentColor} 24%, transparent) !important;
    }
  `
  doc.head.appendChild(style)
}

function installElementPicker(
  doc: Document,
  onElementSelected: (attachment: ElementAttachmentMeta) => void,
  onElementSelectionCancel?: () => void,
  onError?: (message: string) => void,
) {
  ensurePickerStyle(doc)
  doc.documentElement.setAttribute(ELEMENT_PICKER_ACTIVE_ATTR, 'true')

  const overlay = createElementPickerOverlay(doc)
  let hoveredElement: Element | null = null
  let selecting = false

  const preventPageInteraction = (event: Event) => {
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
  }

  const updateHoveredElement = (clientX: number, clientY: number) => {
    hoveredElement = resolvePickerTarget(doc, clientX, clientY)
    overlay.setTarget(hoveredElement)
  }

  const selectElement = (target: Element | null) => {
    if (!target || selecting) return

    selecting = true
    hoveredElement = target
    overlay.setTarget(target, 'selected')

    try {
      onElementSelected(createElementAttachment(doc, target))
    } catch (error: unknown) {
      onError?.(
        error instanceof Error
          ? error.message
          : 'Failed to attach selected element.',
      )
    } finally {
      selecting = false
    }
  }

  const handleClick = (event: MouseEvent) => {
    preventPageInteraction(event)
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    preventPageInteraction(event)
    onElementSelectionCancel?.()
  }

  const handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    preventPageInteraction(event)
    updateHoveredElement(event.clientX, event.clientY)
  }

  const handlePointerMove = (event: PointerEvent) => {
    preventPageInteraction(event)
    if (!selecting) updateHoveredElement(event.clientX, event.clientY)
  }

  const handlePointerOut = (event: PointerEvent) => {
    if (event.relatedTarget && doc.contains(event.relatedTarget as Node)) return
    hoveredElement = null
    overlay.hide()
  }

  const handlePointerUp = (event: PointerEvent) => {
    if (event.button !== 0) return
    preventPageInteraction(event)
    selectElement(
      resolvePickerTarget(doc, event.clientX, event.clientY) ?? hoveredElement,
    )
  }

  const handleViewportChange = () => overlay.update()

  doc.addEventListener('click', handleClick, true)
  doc.addEventListener('keydown', handleKeyDown, true)
  doc.addEventListener('pointerdown', handlePointerDown, true)
  doc.addEventListener('pointermove', handlePointerMove, true)
  doc.addEventListener('pointerout', handlePointerOut, true)
  doc.addEventListener('pointerup', handlePointerUp, true)
  doc.addEventListener('scroll', handleViewportChange, true)
  doc.defaultView?.addEventListener('resize', handleViewportChange)

  return () => {
    overlay.destroy()
    doc.documentElement.removeAttribute(ELEMENT_PICKER_ACTIVE_ATTR)
    doc.removeEventListener('click', handleClick, true)
    doc.removeEventListener('keydown', handleKeyDown, true)
    doc.removeEventListener('pointerdown', handlePointerDown, true)
    doc.removeEventListener('pointermove', handlePointerMove, true)
    doc.removeEventListener('pointerout', handlePointerOut, true)
    doc.removeEventListener('pointerup', handlePointerUp, true)
    doc.removeEventListener('scroll', handleViewportChange, true)
    doc.defaultView?.removeEventListener('resize', handleViewportChange)
  }
}

function isElementPickerOverlay(element: Element) {
  return (
    element.hasAttribute(ELEMENT_PICKER_OVERLAY_ATTR) ||
    element.closest(`[${ELEMENT_PICKER_OVERLAY_ATTR}]`) !== null
  )
}

function isSelectableElement(doc: Document, element: Element) {
  if (element.ownerDocument !== doc) return false
  if (isElementPickerOverlay(element)) return false
  if (NON_SELECTABLE_PICKER_TAGS.has(element.tagName.toLowerCase()))
    return false

  const view = doc.defaultView ?? window
  const style = view.getComputedStyle(element)
  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    Number(style.opacity) <= 0
  ) {
    return false
  }

  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function LandingEmptyState({ className }: { className?: string }) {
  return (
    <div
      className={`grid place-items-center bg-muted/40 text-center ${className ?? 'h-svh w-screen border-0'}`}
    >
      <div className="max-w-md px-6">
        <div
          aria-hidden="true"
          className="mx-auto mb-4 grid size-12 place-items-center rounded-none border bg-background text-lg shadow-sm"
        >
          ▲
        </div>
        <h2 className="text-lg font-semibold">Landing page preview</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Describe a landing page below to generate a single-file HTML preview.
          Paste reference URLs to scrape a brand first.
        </p>
      </div>
    </div>
  )
}

function resolvePickerTarget(
  doc: Document,
  clientX: number,
  clientY: number,
): Element | null {
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null
  return (
    doc
      .elementsFromPoint(clientX, clientY)
      .find((element) => isSelectableElement(doc, element)) ?? null
  )
}
