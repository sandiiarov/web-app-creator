import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import type { PanelPosition } from './panel-constants'

const STORAGE_KEY = 'landing.promptPanel.launcher.v1'

/** Compact placement starts at the visible panel and remains independently draggable. */
export function useLauncherDrag(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  const [position, setPosition] = useState<null | PanelPosition>(readPosition)
  const [dragging, setDragging] = useState(false)
  const positionRef = useRef(position)
  const suppressClick = useRef(false)
  const gesture = useRef<null | {
    capture: HTMLElement
    element: HTMLElement
    moved: boolean
    next: PanelPosition
    origin: PanelPosition
    pointerId: number
    start: PanelPosition
  }>(null)
  const frame = useRef<null | number>(null)

  function clamp(next: PanelPosition, element: HTMLElement) {
    const viewport = window.visualViewport
    const left = viewport?.offsetLeft ?? 0
    const top = viewport?.offsetTop ?? 0
    return {
      x: Math.max(
        left,
        Math.min(
          next.x,
          left + (viewport?.width ?? window.innerWidth) - element.offsetWidth,
        ),
      ),
      y: Math.max(
        top,
        Math.min(
          next.y,
          top + (viewport?.height ?? window.innerHeight) - element.offsetHeight,
        ),
      ),
    }
  }

  const commit = useCallback((next: PanelPosition) => {
    positionRef.current = next
    setPosition(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* Placement remains usable when storage is unavailable. */
    }
  }, [])

  const capturePosition = useCallback(() => {
    const rect = ref.current?.getBoundingClientRect()
    if (rect) commit({ x: rect.left, y: rect.top })
  }, [commit, ref])

  useLayoutEffect(() => {
    if (!enabled) return
    const update = () => {
      if (positionRef.current && ref.current)
        commit(clamp(positionRef.current, ref.current))
    }
    update()
    const observer = new ResizeObserver(update)
    if (ref.current) observer.observe(ref.current)
    window.addEventListener('resize', update)
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
    }
  }, [commit, enabled, ref])

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    },
    [],
  )

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0 || !event.isPrimary) return
    const element = ref.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    suppressClick.current = false
    const capture =
      event.target instanceof Element
        ? (event.target.closest<HTMLElement>('[data-panel-drag-handle]') ??
          event.currentTarget)
        : event.currentTarget
    gesture.current = {
      capture,
      element,
      moved: false,
      next: { x: rect.left, y: rect.top },
      origin: { x: rect.left, y: rect.top },
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
    }
    capture.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return
    const dx = event.clientX - current.start.x
    const dy = event.clientY - current.start.y
    if (!current.moved && Math.hypot(dx, dy) < 5) return
    if (!current.moved) {
      current.moved = true
      suppressClick.current = true
      setDragging(true)
    }
    current.next = clamp(
      { x: current.origin.x + dx, y: current.origin.y + dy },
      current.element,
    )
    if (frame.current !== null) return
    frame.current = requestAnimationFrame(() => {
      frame.current = null
      const active = gesture.current
      if (!active) return
      Object.assign(active.element.style, {
        bottom: 'auto',
        left: `${active.next.x}px`,
        right: 'auto',
        top: `${active.next.y}px`,
      })
    })
  }

  function finish(event: PointerEvent<HTMLElement>) {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
    gesture.current = null
    if (current.moved) commit(current.next)
    setDragging(false)
    if (current.capture.hasPointerCapture(event.pointerId))
      current.capture.releasePointerCapture(event.pointerId)
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    suppressClick.current = false
    const delta = event.shiftKey ? 48 : 16
    const direction = {
      ArrowDown: { x: 0, y: delta },
      ArrowLeft: { x: -delta, y: 0 },
      ArrowRight: { x: delta, y: 0 },
      ArrowUp: { x: 0, y: -delta },
    }[event.key]
    if (!direction) return
    event.preventDefault()
    const element = ref.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    commit(
      clamp({ x: rect.left + direction.x, y: rect.top + direction.y }, element),
    )
  }

  const getPosition = useCallback(() => positionRef.current, [])

  return {
    capturePosition,
    dragging,
    getPosition,
    handlers: {
      onKeyDown,
      onLostPointerCapture: finish,
      onPointerCancel: finish,
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
    },
    shouldOpen: () => !suppressClick.current,
    style: position
      ? ({
          bottom: 'auto',
          left: position.x,
          right: 'auto',
          top: position.y,
        } satisfies CSSProperties)
      : undefined,
  }
}

function readPosition(): null | PanelPosition {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? 'null',
    )
    return parsed &&
      typeof parsed.x === 'number' &&
      Number.isFinite(parsed.x) &&
      typeof parsed.y === 'number' &&
      Number.isFinite(parsed.y)
      ? { x: parsed.x, y: parsed.y }
      : null
  } catch {
    return null
  }
}
