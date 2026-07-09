import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@workspace/ui/components/resizable'
import { cn } from '@workspace/ui/lib/utils'
import {
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { useHotkeys } from 'react-hotkeys-hook'

import { Composer } from './composer'
import type {
  ElementAttachmentInput,
  ImageAttachmentInput,
  ImageAttachmentMediaType,
  LandingAgentSendInput,
  LandingModels,
  LandingTurn,
  PromptAttachmentInput,
} from './domain'
import { KEYBOARD_SHORTCUTS } from './keyboard-shortcuts'
import { PanelBody } from './panel-body'
import {
  COLLAPSED_HEIGHT,
  PANEL_HEIGHT,
  PANEL_MARGIN,
  PANEL_WIDTH_CSS_VAR,
  clampPanelWidth,
  maxPanelWidth,
  type PanelLayout,
  type PanelPosition,
  type PanelTheme,
  type PreviewViewport,
} from './panel-constants'
import { PanelHeader } from './panel-header'
import { panelStatus } from './panel-status'
import {
  PANEL_POSITION_STORAGE_KEY,
  readStoredPanelState,
  readStoredPanelWidth,
} from './panel-storage'

const ACCEPTED_ATTACHMENT_TYPES = new Set<ImageAttachmentMediaType>([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
])
const MAX_ATTACHMENT_COUNT = 4
const MAX_ATTACHMENT_SIZE = 8 * 1024 * 1024
const MAX_ATTACHMENT_TOTAL_SIZE = 16 * 1024 * 1024

export type PromptPanelProps = {
  canDownload: boolean
  elementSelectionActive: boolean
  isStreaming: boolean
  models: LandingModels
  onAllProjects: () => void
  onDownloadHtml: () => void
  onElementSelectionToggle: () => void
  onLayoutChange?: (layout: PanelLayout) => void
  onModelsChange: (models: LandingModels) => void
  onSelectedElementAttachmentConsumed: () => void
  onSend: (input: LandingAgentSendInput) => void
  onStop: () => void
  onToggleTheme: () => void
  onViewportChange: (viewport: PreviewViewport) => void
  selectedElementAttachment: ElementAttachmentInput | null
  theme: PanelTheme
  turns: LandingTurn[]
  viewport: PreviewViewport
}

type DragState = {
  offsetX: number
  offsetY: number
  pointerX: number
  pointerY: number
  rafId: null | number
}

type ResizeState = {
  edge: 'left' | 'right'
  lastWidth: number
  pointerX: number
  rafId: null | number
  startLeft: number
  startPointerX: number
  startWidth: number
}

export function PromptPanel({
  canDownload,
  elementSelectionActive,
  isStreaming,
  models,
  onAllProjects,
  onDownloadHtml,
  onElementSelectionToggle,
  onLayoutChange,
  onModelsChange,
  onSelectedElementAttachmentConsumed,
  onSend,
  onStop,
  onToggleTheme,
  onViewportChange,
  selectedElementAttachment,
  theme,
  turns,
  viewport,
}: PromptPanelProps) {
  const [collapsed, setCollapsed] = useState(initialPanelCollapsed)
  const [panelMenuOpen, setPanelMenuOpen] = useState(false)
  const [position, setPosition] = useState<PanelPosition>(initialPanelPosition)
  const [prompt, setPrompt] = useState('')
  const [attachments, setAttachments] = useState<PromptAttachmentInput[]>([])
  const [attachmentError, setAttachmentError] = useState<null | string>(null)
  const [dragging, setDragging] = useState(false)
  const [resizing, setResizing] = useState(false)

  const sectionRef = useRef<HTMLElement | null>(null)
  const dragState = useRef<DragState | null>(null)
  const resizeState = useRef<null | ResizeState>(null)
  const widthRef = useRef<number>(initialPanelWidth())

  useLayoutEffect(() => {
    setPanelWidthVar(widthRef.current)
  }, [])

  useClampToViewport(position, setPosition, collapsed, widthRef)

  useEffect(() => {
    writeStoredPanelState(position, collapsed, widthRef.current)
  }, [collapsed, position])

  useEffect(() => {
    if (!onLayoutChange) return
    const docked = dragging ? null : dockedPanelSide(position, widthRef.current)
    const reportedLayout: PanelLayout =
      dragging || collapsed
        ? 'floating'
        : docked
          ? `${docked}-sidebar`
          : 'floating'
    onLayoutChange(reportedLayout)
  }, [collapsed, dragging, onLayoutChange, position])

  useEffect(() => {
    if (!selectedElementAttachment) return

    try {
      setAttachments(
        appendPromptAttachment(attachments, selectedElementAttachment),
      )
      setAttachmentError(null)
    } catch (error) {
      setAttachmentError(
        error instanceof Error ? error.message : 'Failed to attach element',
      )
    } finally {
      onSelectedElementAttachmentConsumed()
    }
  }, [
    attachments,
    onSelectedElementAttachmentConsumed,
    selectedElementAttachment,
  ])

  const handleDragStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('button, input, textarea, a, [role="button"]')
      ) {
        return
      }

      setDragging(true)
      dragState.current = {
        offsetX: event.clientX - position.x,
        offsetY: event.clientY - position.y,
        pointerX: event.clientX,
        pointerY: event.clientY,
        rafId: null,
      }
      ;(event.target as HTMLElement).setPointerCapture?.(event.pointerId)
    },
    [position.x, position.y],
  )

  const handleDragMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const state = dragState.current
      if (!dragging || !state) {
        return
      }

      state.pointerX = event.clientX
      state.pointerY = event.clientY

      if (state.rafId !== null) {
        return
      }

      state.rafId = window.requestAnimationFrame(() => {
        const current = dragState.current
        if (!current || !sectionRef.current) {
          if (current) current.rafId = null
          return
        }

        current.rafId = null
        const next = clampPanelPosition(
          {
            x: current.pointerX - current.offsetX,
            y: current.pointerY - current.offsetY,
          },
          collapsed,
          widthRef.current,
        )
        sectionRef.current.style.left = `${next.x}px`
        sectionRef.current.style.top = `${next.y}px`
      })
    },
    [collapsed, dragging],
  )

  const handleDragEnd = useCallback(() => {
    const state = dragState.current

    if (state?.rafId != null) {
      window.cancelAnimationFrame(state.rafId)
    }

    if (state) {
      setPosition(
        clampPanelPosition(
          {
            x: state.pointerX - state.offsetX,
            y: state.pointerY - state.offsetY,
          },
          collapsed,
          widthRef.current,
        ),
      )
    }

    setDragging(false)
    dragState.current = null
  }, [collapsed])

  const handleLayoutChange = useCallback(
    (nextLayout: PanelLayout) => {
      if (nextLayout === 'left-sidebar') {
        setPosition({ x: 0, y: 0 })
        return
      }

      if (nextLayout === 'right-sidebar') {
        setPosition({ x: rightDockX(widthRef.current), y: 0 })
        return
      }

      setPosition(floatingPositionFrom(position, widthRef.current))
    },
    [position],
  )

  const handleResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, side: 'left' | 'right') => {
      event.stopPropagation()
      resizeState.current = {
        edge: side,
        lastWidth: widthRef.current,
        pointerX: event.clientX,
        rafId: null,
        startLeft: position.x,
        startPointerX: event.clientX,
        startWidth: widthRef.current,
      }
      setResizing(true)
      event.currentTarget.setPointerCapture?.(event.pointerId)
    },
    [position.x],
  )

  const handleResizeMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const state = resizeState.current
      if (!state) return

      state.pointerX = event.clientX
      if (state.rafId !== null) return

      state.rafId = window.requestAnimationFrame(() => {
        const current = resizeState.current
        if (!current || !sectionRef.current) {
          if (current) current.rafId = null
          return
        }
        current.rafId = null

        const delta = current.pointerX - current.startPointerX
        const candidate =
          current.edge === 'right'
            ? current.startWidth + delta
            : current.startWidth - delta
        const available = Math.min(
          current.edge === 'right'
            ? window.innerWidth - current.startLeft
            : current.startLeft + current.startWidth,
          maxPanelWidth(),
        )
        const next = clampPanelWidth(candidate, available)
        current.lastWidth = next

        setPanelWidthVar(next)
        if (current.edge === 'left') {
          const nextLeft = Math.max(
            0,
            current.startLeft + current.startWidth - next,
          )
          sectionRef.current.style.left = `${nextLeft}px`
        }
      })
    },
    [],
  )

  const handleResizeEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.stopPropagation()
      const state = resizeState.current
      if (state?.rafId != null) {
        window.cancelAnimationFrame(state.rafId)
      }

      const startLeft = state?.startLeft ?? position.x
      const startWidth = state?.startWidth ?? widthRef.current
      const edge = state?.edge
      const next = clampPanelWidth(state?.lastWidth ?? widthRef.current)
      resizeState.current = null
      widthRef.current = next
      setResizing(false)
      setPanelWidthVar(next)

      if (edge === 'left') {
        const nextLeft = Math.max(0, startLeft + startWidth - next)
        setPosition({ x: nextLeft, y: position.y })
      } else {
        writeStoredPanelState(position, collapsed, next)
      }
    },
    [collapsed, position],
  )

  const handleAllProjects = useCallback(() => {
    onAllProjects()
  }, [onAllProjects])

  const handleAttachFiles = useCallback(
    (files: FileList | null) => {
      const selected = Array.from(files ?? [])
      if (selected.length === 0) return

      void attachImageFiles(selected, attachments)
        .then((nextAttachments) => {
          setAttachments(nextAttachments)
          setAttachmentError(null)
        })
        .catch((error: unknown) => {
          setAttachmentError(
            error instanceof Error ? error.message : 'Failed to attach image',
          )
        })
    },
    [attachments],
  )

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((current) => current.filter((item) => item.id !== id))
    setAttachmentError(null)
  }, [])

  const sendPrompt = useCallback(() => {
    const trimmed = prompt.trim()

    if ((!trimmed && attachments.length === 0) || isStreaming) {
      return
    }

    onSend({
      attachments,
      prompt: trimmed || 'Use the attached attachment as reference.',
    })
    setPrompt('')
    setAttachments([])
    setAttachmentError(null)
  }, [attachments, isStreaming, onSend, prompt])

  const stopGeneration = useCallback(() => {
    if (isStreaming) {
      onStop()
    }
  }, [isStreaming, onStop])

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      sendPrompt()
    },
    [sendPrompt],
  )

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        const form = event.currentTarget.form

        if (form && !isStreaming) {
          form.requestSubmit()
        }
      }
    },
    [isStreaming],
  )

  useHotkeys(
    KEYBOARD_SHORTCUTS.allProjects.hotkey,
    () => handleAllProjects(),
    { enableOnFormTags: true, preventDefault: true },
    [handleAllProjects],
  )
  useHotkeys(
    KEYBOARD_SHORTCUTS.layoutLeft.hotkey,
    () => handleLayoutChange('left-sidebar'),
    { enableOnFormTags: true, preventDefault: true },
    [handleLayoutChange],
  )
  useHotkeys(
    KEYBOARD_SHORTCUTS.layoutRight.hotkey,
    () => handleLayoutChange('right-sidebar'),
    { enableOnFormTags: true, preventDefault: true },
    [handleLayoutChange],
  )
  useHotkeys(
    KEYBOARD_SHORTCUTS.layoutFloating.hotkey,
    () => handleLayoutChange('floating'),
    { enableOnFormTags: true, preventDefault: true },
    [handleLayoutChange],
  )
  useHotkeys(
    KEYBOARD_SHORTCUTS.panelToggle.hotkey,
    () => setCollapsed((nextCollapsed) => !nextCollapsed),
    { enableOnFormTags: true, preventDefault: true },
    [],
  )
  useHotkeys(
    KEYBOARD_SHORTCUTS.send.hotkey,
    () => sendPrompt(),
    { enableOnFormTags: true, preventDefault: true },
    [sendPrompt],
  )
  useHotkeys(
    KEYBOARD_SHORTCUTS.stop.hotkey,
    () => stopGeneration(),
    {
      enabled: isStreaming,
      enableOnFormTags: true,
      preventDefault: true,
    },
    [isStreaming, stopGeneration],
  )
  const dockedSide = dragging
    ? null
    : dockedPanelSide(position, widthRef.current)
  const layout: PanelLayout = dockedSide ? `${dockedSide}-sidebar` : 'floating'
  const status = panelStatus({ isStreaming, turns })
  const shouldRenderCollapsed = collapsed
  const panelHeight = collapsed
    ? `${COLLAPSED_HEIGHT}px`
    : dockedSide
      ? '100svh'
      : `${PANEL_HEIGHT}px`
  const panelStyle = {
    height: panelHeight,
    left: `${position.x}px`,
    maxHeight: dockedSide ? '100svh' : `calc(100svh - ${PANEL_MARGIN * 2}px)`,
    maxWidth: '100vw',
    top: `${position.y}px`,
    width: `var(${PANEL_WIDTH_CSS_VAR})`,
  }

  return (
    <section
      aria-label="Prompt panel"
      className={cn(
        'fixed z-30 flex flex-col overflow-hidden border bg-popover/95 text-popover-foreground backdrop-blur-xl',
        'border-border/80',
        shouldRenderCollapsed
          ? 'rounded-none shadow-lg'
          : 'rounded-none shadow-2xl',
        dockedSide === 'left' && 'border-y-0 border-l-0',
        dockedSide === 'right' && 'border-y-0 border-r-0',
        dragging || resizing ? 'select-none' : '',
      )}
      data-landing-prompt-panel=""
      data-resizing={resizing || undefined}
      ref={sectionRef}
      style={panelStyle}
    >
      {shouldRenderCollapsed ? (
        <PanelHeader
          canDownload={canDownload}
          collapsed={collapsed}
          dragging={dragging}
          layout={layout}
          onAllProjects={handleAllProjects}
          onDownloadHtml={onDownloadHtml}
          onDragEnd={handleDragEnd}
          onDragMove={handleDragMove}
          onDragStart={handleDragStart}
          onLayoutChange={handleLayoutChange}
          onPanelMenuOpenChange={setPanelMenuOpen}
          onToggleCollapsed={() => setCollapsed(false)}
          onToggleTheme={onToggleTheme}
          onViewportChange={onViewportChange}
          panelMenuOpen={panelMenuOpen}
          status={status}
          theme={theme}
          viewport={viewport}
        />
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          <PanelHeader
            canDownload={canDownload}
            collapsed={collapsed}
            dragging={dragging}
            layout={layout}
            onAllProjects={handleAllProjects}
            onDownloadHtml={onDownloadHtml}
            onDragEnd={handleDragEnd}
            onDragMove={handleDragMove}
            onDragStart={handleDragStart}
            onLayoutChange={handleLayoutChange}
            onPanelMenuOpenChange={setPanelMenuOpen}
            onToggleCollapsed={() => setCollapsed(true)}
            onToggleTheme={onToggleTheme}
            onViewportChange={onViewportChange}
            panelMenuOpen={panelMenuOpen}
            status={status}
            theme={theme}
            viewport={viewport}
          />
          <ResizablePanelGroup
            className="min-h-0 flex-1"
            orientation="vertical"
          >
            <ResizablePanel
              className="min-h-0"
              defaultSize="70%"
              id="landing-chat"
              minSize="30%"
            >
              <PanelBody isStreaming={isStreaming} turns={turns} />
            </ResizablePanel>
            <ResizableHandle className="bg-border/70" withHandle />
            <ResizablePanel
              className="min-h-0 overflow-visible"
              defaultSize="30%"
              id="landing-composer"
              minSize="30%"
            >
              <Composer
                attachmentError={attachmentError}
                attachments={attachments}
                disabled={
                  isStreaming ||
                  (prompt.trim().length === 0 && attachments.length === 0)
                }
                elementSelectionActive={elementSelectionActive}
                isStreaming={isStreaming}
                models={models}
                onAttachFiles={handleAttachFiles}
                onChange={setPrompt}
                onElementSelectionToggle={onElementSelectionToggle}
                onKeyDown={handleKeyDown}
                onModelsChange={onModelsChange}
                onRemoveAttachment={handleRemoveAttachment}
                onStop={onStop}
                onSubmit={handleSubmit}
                prompt={prompt}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      )}
      {shouldRenderCollapsed ? null : (
        <>
          <PanelResizeHandle
            onResizeEnd={handleResizeEnd}
            onResizeMove={handleResizeMove}
            onResizeStart={handleResizeStart}
            side="left"
          />
          <PanelResizeHandle
            onResizeEnd={handleResizeEnd}
            onResizeMove={handleResizeMove}
            onResizeStart={handleResizeStart}
            side="right"
          />
        </>
      )}
    </section>
  )
}

function appendPromptAttachment(
  current: PromptAttachmentInput[],
  attachment: PromptAttachmentInput,
): PromptAttachmentInput[] {
  if (current.length >= MAX_ATTACHMENT_COUNT) {
    throw new Error(`Attach up to ${MAX_ATTACHMENT_COUNT} items.`)
  }

  const next = [...current, attachment]
  const totalSize = next.reduce(
    (sum, item) => sum + promptAttachmentSize(item),
    0,
  )

  if (totalSize > MAX_ATTACHMENT_TOTAL_SIZE) {
    throw new Error('Attached items must be 16 MiB or smaller in total.')
  }

  return next
}

function assertAttachableImageFile(
  file: File,
): asserts file is File & { type: ImageAttachmentMediaType } {
  if (!isAcceptedAttachmentType(file.type)) {
    throw new Error('Attach PNG, JPEG, WEBP, or GIF images only.')
  }

  if (file.size > MAX_ATTACHMENT_SIZE) {
    throw new Error('Each image must be 8 MiB or smaller.')
  }
}

async function attachImageFiles(
  files: File[],
  current: PromptAttachmentInput[],
): Promise<PromptAttachmentInput[]> {
  const availableSlots = MAX_ATTACHMENT_COUNT - current.length
  if (availableSlots <= 0) {
    throw new Error(`Attach up to ${MAX_ATTACHMENT_COUNT} items.`)
  }

  const selected = files.slice(0, availableSlots)
  if (files.length > availableSlots) {
    throw new Error(`Attach up to ${MAX_ATTACHMENT_COUNT} items.`)
  }

  const additions = await Promise.all(selected.map(fileToImageAttachment))
  return additions.reduce(appendPromptAttachment, current)
}

function clampPanelPosition(
  position: PanelPosition,
  collapsed: boolean,
  width: number,
): PanelPosition {
  const dockedSide = dockedPanelSide(position, width)
  const height = collapsed
    ? COLLAPSED_HEIGHT
    : dockedSide
      ? window.innerHeight
      : PANEL_HEIGHT
  const maxX = rightDockX(width)
  const maxY = Math.max(0, window.innerHeight - height)
  const x = dockedSide === 'right' ? maxX : Math.min(position.x, maxX)
  const y = Math.min(position.y, maxY)

  return {
    x: Math.max(0, x),
    y: Math.max(0, y),
  }
}

function createAttachmentId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `image-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function defaultPanelPosition(width: number): PanelPosition {
  return {
    x: Math.max(
      PANEL_MARGIN,
      Math.min(32, window.innerWidth - width - PANEL_MARGIN),
    ),
    y: Math.max(
      PANEL_MARGIN,
      Math.min(32, window.innerHeight - PANEL_HEIGHT - PANEL_MARGIN),
    ),
  }
}

function dockedPanelSide(position: PanelPosition, width: number) {
  if (position.y !== 0) {
    return null
  }

  if (position.x === 0) {
    return 'left'
  }

  if (position.x === rightDockX(width)) {
    return 'right'
  }

  return null
}

async function fileToImageAttachment(
  file: File,
): Promise<ImageAttachmentInput> {
  assertAttachableImageFile(file)
  const dataUrl = await readFileAsDataUrl(file)

  return {
    dataUrl,
    id: createAttachmentId(),
    mediaType: file.type,
    name: file.name || 'image',
    size: file.size,
  }
}

function floatingPositionFrom(
  position: PanelPosition,
  width: number,
): PanelPosition {
  const dockedSide = dockedPanelSide(position, width)

  if (dockedSide === 'left') {
    return { x: 16, y: 16 }
  }

  if (dockedSide === 'right') {
    return { x: Math.max(0, rightDockX(width) - 16), y: 16 }
  }

  return defaultPanelPosition(width)
}

function initialPanelCollapsed(): boolean {
  return readStoredPanelCollapsed() ?? false
}

function initialPanelPosition(): PanelPosition {
  const width = readStoredPanelWidth()
  return readStoredPanelPosition(width) ?? defaultPanelPosition(width)
}

function initialPanelWidth(): number {
  return readStoredPanelWidth()
}

function isAcceptedAttachmentType(
  value: string,
): value is ImageAttachmentMediaType {
  return ACCEPTED_ATTACHMENT_TYPES.has(value as ImageAttachmentMediaType)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function PanelResizeHandle({
  onResizeEnd,
  onResizeMove,
  onResizeStart,
  side,
}: {
  onResizeEnd: (event: ReactPointerEvent<HTMLDivElement>) => void
  onResizeMove: (event: ReactPointerEvent<HTMLDivElement>) => void
  onResizeStart: (
    event: ReactPointerEvent<HTMLDivElement>,
    side: 'left' | 'right',
  ) => void
  side: 'left' | 'right'
}) {
  return (
    <div
      aria-label={
        side === 'left' ? 'Resize panel left edge' : 'Resize panel right edge'
      }
      aria-orientation="vertical"
      className={cn(
        'absolute inset-y-0 z-40 w-1.5 cursor-col-resize touch-none hover:bg-accent/40',
        side === 'left' ? 'left-0' : 'right-0',
      )}
      onPointerDown={(event) => onResizeStart(event, side)}
      onPointerMove={onResizeMove}
      onPointerUp={onResizeEnd}
      role="separator"
    />
  )
}

function promptAttachmentSize(attachment: PromptAttachmentInput) {
  return (
    attachment.size +
    (attachment.kind === 'element' ? new Blob([attachment.html]).size : 0)
  )
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed to read image file.'))
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('Failed to read image file.'))
    }
    reader.readAsDataURL(file)
  })
}

function readStoredPanelCollapsed(): boolean | null {
  const collapsed = readStoredPanelState()?.collapsed
  return typeof collapsed === 'boolean' ? collapsed : null
}

function readStoredPanelPosition(width: number): null | PanelPosition {
  const state = readStoredPanelState()
  if (!state) return null
  if (!isFiniteNumber(state.x) || !isFiniteNumber(state.y)) return null

  if (state.layout === 'left-sidebar') return { x: 0, y: 0 }
  if (state.layout === 'right-sidebar') return { x: rightDockX(width), y: 0 }

  return clampPanelPosition({ x: state.x, y: state.y }, false, width)
}

function rightDockX(width: number) {
  return Math.max(0, window.innerWidth - Math.min(width, window.innerWidth))
}

function setPanelWidthVar(width: number) {
  document.documentElement.style.setProperty(PANEL_WIDTH_CSS_VAR, `${width}px`)
}

function useClampToViewport(
  position: PanelPosition,
  setPosition: (next: PanelPosition) => void,
  collapsed: boolean,
  widthRef: RefObject<number>,
) {
  useEffect(() => {
    const onResize = () => {
      const nextPosition = clampPanelPosition(
        position,
        collapsed,
        widthRef.current,
      )

      if (nextPosition.x !== position.x || nextPosition.y !== position.y) {
        setPosition(nextPosition)
      }
    }

    onResize()
    window.addEventListener('resize', onResize)

    return () => window.removeEventListener('resize', onResize)
  }, [collapsed, position, setPosition, widthRef])
}

function writeStoredPanelState(
  position: PanelPosition,
  collapsed: boolean,
  width: number,
) {
  try {
    const dockedSide = dockedPanelSide(position, width)
    const layout: PanelLayout = dockedSide
      ? `${dockedSide}-sidebar`
      : 'floating'

    window.localStorage.setItem(
      PANEL_POSITION_STORAGE_KEY,
      JSON.stringify({ ...position, collapsed, layout, width }),
    )
  } catch {
    // Ignore storage errors from private mode or blocked localStorage.
  }
}
