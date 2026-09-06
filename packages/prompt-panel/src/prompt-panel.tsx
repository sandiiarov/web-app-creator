import { Button } from '@workspace/ui/components/button'
import { cn } from '@workspace/ui/lib/utils'
import {
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type ReactNode,
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
  LandingModelPricing,
  LandingModels,
  LandingTurn,
  PromptAttachmentInput,
} from './domain'
import { KEYBOARD_SHORTCUTS } from './keyboard-shortcuts'
import { PanelBody } from './panel-body'
import {
  COLLAPSED_HEIGHT,
  MIN_PANEL_WIDTH,
  PANEL_HEIGHT,
  PANEL_MARGIN,
  PANEL_WIDTH_CSS_VAR,
  clampPanelWidth,
  maxPanelWidth,
  type PanelLayout,
  type PanelPosition,
  type PanelTheme,
} from './panel-constants'
import { PanelHeader } from './panel-header'
import { panelStatus } from './panel-status'
import {
  PANEL_POSITION_STORAGE_KEY,
  readStoredPanelState,
  readStoredPanelWidth,
} from './panel-storage'
import { useLauncherDrag } from './use-launcher-drag'

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
  canSelectElement: boolean
  connection: 'connecting' | 'live' | 'offline' | 'reconnecting'
  draft: { attachments: PromptAttachmentInput[]; prompt: string }
  draftError?: null | string
  draftReady: boolean
  elementSelectionActive: boolean
  isStopping: boolean
  isStreaming: boolean
  modelPricing?: Record<string, LandingModelPricing>
  models: LandingModels
  onAllProjects: () => void
  onDraftChange: (
    update: (draft: {
      attachments: PromptAttachmentInput[]
      prompt: string
    }) => { attachments: PromptAttachmentInput[]; prompt: string },
  ) => void
  onElementSelectionToggle: () => void
  onLayoutChange?: (layout: PanelLayout) => void
  onLocateElement: (selector: string) => void
  onModelsChange: (models: LandingModels) => void
  onReconnect: () => void
  onRenameProject: () => void
  onRetryTurn: (turn: LandingTurn) => void
  onSelectedElementAttachmentConsumed: () => void
  onSend: (input: LandingAgentSendInput) => Promise<boolean>
  onStop: () => void
  onToggleTheme: () => void
  pageActions: ReactNode
  projectSwitcher: ReactNode
  projectTitle: string
  selectedElementAttachment: ElementAttachmentInput | null
  theme: PanelTheme
  turns: LandingTurn[]
}

type DragState = {
  moved: boolean
  offsetX: number
  offsetY: number
  pointerX: number
  pointerY: number
  rafId: null | number
  startX: number
  startY: number
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
  canSelectElement,
  connection,
  draft,
  draftError,
  draftReady,
  elementSelectionActive,
  isStopping,
  isStreaming,
  modelPricing,
  models,
  onAllProjects,
  onDraftChange,
  onElementSelectionToggle,
  onLayoutChange,
  onLocateElement,
  onModelsChange,
  onReconnect,
  onRenameProject,
  onRetryTurn,
  onSelectedElementAttachmentConsumed,
  onSend,
  onStop,
  onToggleTheme,
  pageActions,
  projectSwitcher,
  projectTitle,
  selectedElementAttachment,
  theme,
  turns,
}: PromptPanelProps) {
  const [collapsed, setCollapsed] = useState(initialPanelCollapsed)
  const [projectsOpen, setProjectsOpen] = useState(false)
  const suppressTitleClick = useRef(false)
  const [panelMenuOpen, setPanelMenuOpen] = useState(false)
  const [position, setPosition] = useState<PanelPosition>(initialPanelPosition)
  const { attachments, prompt } = draft
  const setPrompt = useCallback(
    (value: string) =>
      onDraftChange((current) => ({ ...current, prompt: value })),
    [onDraftChange],
  )
  const setAttachments = useCallback(
    (
      value:
        | ((current: PromptAttachmentInput[]) => PromptAttachmentInput[])
        | PromptAttachmentInput[],
    ) =>
      onDraftChange((current) => ({
        ...current,
        attachments:
          typeof value === 'function' ? value(current.attachments) : value,
      })),
    [onDraftChange],
  )
  const [mobileExpanded, setMobileExpanded] = useState(false)
  const [keyboardWidth, setKeyboardWidth] = useState(initialPanelWidth)
  const [submitting, setSubmitting] = useState(false)
  const submitLock = useRef(false)
  const [attachmentError, setAttachmentError] = useState<null | string>(null)
  const [dragging, setDragging] = useState(false)
  const [resizing, setResizing] = useState(false)

  const sectionRef = useRef<HTMLElement | null>(null)
  const launcherDrag = useLauncherDrag(sectionRef, collapsed)
  const {
    capturePosition: captureCompactPosition,
    getPosition: getCompactPosition,
  } = launcherDrag
  const wasCollapsed = useRef(collapsed)
  const dragState = useRef<DragState | null>(null)
  const resizeState = useRef<null | ResizeState>(null)
  const widthRef = useRef<number>(initialPanelWidth())

  const placementRef = useRef({ collapsed, position })
  placementRef.current = { collapsed, position }

  const setPanelCollapsed = useCallback(
    (next: boolean) => {
      const current = placementRef.current
      if (next === current.collapsed) return
      const compactPosition = getCompactPosition()
      if (next) {
        // Capture before hiding the conversation: never jump to an old launcher location.
        captureCompactPosition()
      } else if (window.innerWidth >= 768 && compactPosition) {
        // The compact position owns restoration, including dragging away from a dock.
        // An untouched dock still restores because its captured position is the dock origin.
        setPosition(
          clampPanelPosition(compactPosition, false, widthRef.current),
        )
      }
      placementRef.current = { ...current, collapsed: next }
      setCollapsed(next)
    },
    [captureCompactPosition, getCompactPosition],
  )

  useEffect(() => {
    if (wasCollapsed.current === collapsed) return
    wasCollapsed.current = collapsed
    if (collapsed) return
    let frame = 0
    const focusVisibleTarget = () => {
      const target =
        sectionRef.current?.querySelector<HTMLTextAreaElement>('textarea')
      if (!target) return
      // Visibility changes on the next animation frame. Focusing earlier is ignored by the browser.
      if (getComputedStyle(target).visibility !== 'visible') {
        frame = requestAnimationFrame(focusVisibleTarget)
        return
      }
      target.focus({ preventScroll: true })
    }
    frame = requestAnimationFrame(focusVisibleTarget)
    return () => cancelAnimationFrame(frame)
  }, [collapsed])

  const handleSuggestion = useCallback(
    (value: string) => {
      setPrompt(value)
      sectionRef.current
        ?.querySelector<HTMLTextAreaElement>('textarea')
        ?.focus()
    },
    [setPrompt],
  )

  useLayoutEffect(() => {
    setPanelWidthVar(widthRef.current)
  }, [])

  useClampToViewport(position, setPosition, false, widthRef)
  useEffect(() => {
    const viewport = window.visualViewport
    const update = () => {
      const root = document.documentElement
      root.dataset.assistantKeyboard = String(
        (viewport?.height ?? window.innerHeight) < window.innerHeight - 100,
      )
      root.style.setProperty(
        '--assistant-visible-height',
        `${viewport?.height ?? window.innerHeight}px`,
      )
      root.style.setProperty(
        '--assistant-keyboard-inset',
        `${Math.max(0, window.innerHeight - (viewport?.height ?? window.innerHeight) - (viewport?.offsetTop ?? 0))}px`,
      )
    }
    update()
    viewport?.addEventListener('resize', update)
    viewport?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => {
      viewport?.removeEventListener('resize', update)
      viewport?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

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
    setAttachments,
  ])

  const handleDragStart = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (
        event.target instanceof Element &&
        event.target.closest('button, input, textarea, a, [role="button"]') &&
        !event.target.closest('[data-panel-drag-handle]')
      ) {
        return
      }

      if (event.button !== 0 || window.matchMedia('(max-width: 767px)').matches)
        return

      suppressTitleClick.current = false
      dragState.current = {
        moved: false,
        offsetX: event.clientX - position.x,
        offsetY:
          event.clientY - event.currentTarget.getBoundingClientRect().top,
        pointerX: event.clientX,
        pointerY: event.clientY,
        rafId: null,
        startX: event.clientX,
        startY: event.clientY,
      }
      // Keep clicks on the stable title button; its pointer events bubble to the header.
      const capture =
        event.target instanceof Element
          ? (event.target.closest<HTMLElement>('[data-panel-drag-handle]') ??
            event.currentTarget)
          : event.currentTarget
      capture.setPointerCapture(event.pointerId)
    },
    [position.x],
  )

  const handleDragMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const state = dragState.current
      if (!state) {
        return
      }

      if (
        !state.moved &&
        Math.hypot(event.clientX - state.startX, event.clientY - state.startY) <
          5
      )
        return
      state.moved = true
      suppressTitleClick.current = true
      setDragging(true)
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
    [collapsed],
  )

  const handleDragEnd = useCallback(() => {
    const state = dragState.current

    if (state?.rafId != null) {
      window.cancelAnimationFrame(state.rafId)
    }

    if (state?.moved) {
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
      if (window.innerWidth < 768) return
      setPanelCollapsed(false)
      if (nextLayout === 'left-sidebar') {
        setPosition({ x: 0, y: 0 })
        return
      }

      if (nextLayout === 'right-sidebar') {
        setPosition({ x: rightDockX(widthRef.current), y: 0 })
        return
      }

      setPosition(defaultPanelPosition(widthRef.current))
    },
    [setPanelCollapsed],
  )

  const handleResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLElement>, side: 'left' | 'right') => {
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
    (event: ReactPointerEvent<HTMLElement>) => {
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
    (event: ReactPointerEvent<HTMLElement>) => {
      event.stopPropagation()
      const state = resizeState.current
      if (!state) return
      if (state.rafId != null) {
        window.cancelAnimationFrame(state.rafId)
      }

      const startLeft = state?.startLeft ?? position.x
      const startWidth = state?.startWidth ?? widthRef.current
      const edge = state?.edge
      const next = clampPanelWidth(state?.lastWidth ?? widthRef.current)
      resizeState.current = null
      widthRef.current = next
      setKeyboardWidth(next)
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

  const handleResizeKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    side: 'left' | 'right',
  ) => {
    const increase = side === 'right' ? 'ArrowRight' : 'ArrowLeft'
    if (!['ArrowLeft', 'ArrowRight', 'End', 'Home'].includes(event.key)) return
    event.preventDefault()
    const next = clampPanelWidth(
      event.key === 'Home'
        ? MIN_PANEL_WIDTH
        : event.key === 'End'
          ? maxPanelWidth()
          : widthRef.current +
            (event.key === increase ? 1 : -1) * (event.shiftKey ? 48 : 16),
    )
    const x =
      side === 'left'
        ? Math.max(0, position.x + widthRef.current - next)
        : position.x
    widthRef.current = next
    setKeyboardWidth(next)
    setPanelWidthVar(next)
    setPosition(clampPanelPosition({ x, y: position.y }, false, next))
    writeStoredPanelState({ x, y: position.y }, collapsed, next)
  }

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
    [attachments, setAttachments],
  )

  const handleRemoveAttachment = useCallback(
    (id: string) => {
      setAttachments((current) => current.filter((item) => item.id !== id))
      setAttachmentError(null)
    },
    [setAttachments],
  )

  const sendPrompt = useCallback(async () => {
    const trimmed = prompt.trim()

    if (
      (!trimmed && attachments.length === 0) ||
      isStreaming ||
      submitLock.current ||
      !draftReady ||
      connection !== 'live'
    ) {
      return
    }

    submitLock.current = true
    setSubmitting(true)
    try {
      const accepted = await onSend({
        attachments,
        prompt: trimmed || 'Use the attached reference.',
      })
      if (accepted) {
        setPanelCollapsed(false)
        setProjectsOpen(false)
        onDraftChange((current) =>
          current.prompt === prompt && current.attachments === attachments
            ? { attachments: [], prompt: '' }
            : current,
        )
        setAttachmentError(null)
      }
    } finally {
      submitLock.current = false
      setSubmitting(false)
    }
  }, [
    attachments,
    isStreaming,
    onSend,
    prompt,
    onDraftChange,
    draftReady,
    connection,
    setPanelCollapsed,
  ])

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
      if (
        event.key === 'Enter' &&
        !event.shiftKey &&
        !event.nativeEvent.isComposing &&
        event.keyCode !== 229
      ) {
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
    () => setPanelCollapsed(!collapsed),
    { enableOnFormTags: true, preventDefault: true },
    [collapsed, setPanelCollapsed],
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
  const panelHeight = collapsed
    ? 'auto'
    : dockedSide
      ? '100dvh'
      : `${PANEL_HEIGHT}px`
  const panelStyle = {
    height: panelHeight,
    left: `${position.x}px`,
    maxHeight: dockedSide ? '100dvh' : 'calc(100svh - 40px)',
    maxWidth: '100vw',
    top: `${dockedSide ? 0 : position.y}px`,
    width: `var(${PANEL_WIDTH_CSS_VAR})`,
    ...(collapsed
      ? {
          bottom: 'calc(20px + var(--assistant-keyboard-inset, 0px))',
          height: 'auto',
          left: 'auto',
          maxHeight: 'calc(var(--assistant-visible-height, 100dvh) - 16px)',
          maxWidth: 'calc(100vw - 16px)',
          right: 'min(20px, 2.5vw)',
          top: 'auto',
          ...launcherDrag.style,
        }
      : {}),
  }

  return (
    <>
      <section
        aria-labelledby="assistant-title"
        className={cn(
          'liquid-panel fixed z-30 flex flex-col overflow-hidden rounded-3xl text-popover-foreground',
          dockedSide === 'left' && 'rounded-l-none',
          dockedSide === 'right' && 'rounded-r-none',
          dragging || resizing ? 'select-none' : '',
        )}
        data-collapsed={collapsed}
        data-dragging={dragging || launcherDrag.dragging || undefined}
        data-has-attachments={attachments.length > 0 || !!attachmentError}
        data-landing-prompt-panel=""
        data-layout={layout}
        data-mobile-expanded={mobileExpanded}
        data-projects-open={projectsOpen}
        data-resizing={resizing || undefined}
        data-status={status}
        id="page-assistant"
        ref={sectionRef}
        style={panelStyle}
      >
        <div className="flex h-full min-h-0 flex-col">
          <PanelHeader
            collapsed={collapsed}
            connection={connection}
            dragging={dragging}
            layout={layout}
            mobileExpanded={mobileExpanded}
            onAllProjects={() => {
              setProjectsOpen((open) => !open)
              setPanelCollapsed(false)
            }}
            onDragEnd={
              collapsed ? launcherDrag.handlers.onPointerUp : handleDragEnd
            }
            onDragKeyDown={(event) => {
              if (collapsed) launcherDrag.handlers.onKeyDown(event)
              else suppressTitleClick.current = false
            }}
            onDragMove={
              collapsed ? launcherDrag.handlers.onPointerMove : handleDragMove
            }
            onDragStart={
              collapsed ? launcherDrag.handlers.onPointerDown : handleDragStart
            }
            onLayoutChange={handleLayoutChange}
            onMobileExpandedChange={setMobileExpanded}
            onPanelMenuOpenChange={setPanelMenuOpen}
            onRenameProject={() => {
              if (collapsed) {
                if (launcherDrag.shouldOpen()) setPanelCollapsed(false)
              } else if (!suppressTitleClick.current) onRenameProject()
            }}
            onToggleCollapsed={() => {
              setProjectsOpen(false)
              setPanelCollapsed(!collapsed)
            }}
            onToggleTheme={onToggleTheme}
            pageActions={pageActions}
            panelMenuOpen={panelMenuOpen}
            projectsOpen={projectsOpen}
            projectTitle={projectTitle}
            status={status}
            statusText={
              connection !== 'live'
                ? connection === 'offline'
                  ? 'Disconnected'
                  : connection === 'connecting'
                    ? 'Connecting…'
                    : 'Reconnecting…'
                : isStopping
                  ? 'Stopping…'
                  : undefined
            }
            theme={theme}
          />
          {connection !== 'live' ? (
            <div
              className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2 text-xs"
              role="status"
            >
              <span>
                {connection === 'offline'
                  ? 'Connection lost. Your page and draft are here.'
                  : connection === 'reconnecting'
                    ? 'Reconnecting to check the latest changes…'
                    : 'Opening your project…'}
              </span>
              <Button onClick={onReconnect} size="xs" variant="outline">
                Retry
              </Button>
            </div>
          ) : null}
          {projectsOpen ? (
            <div className="assistant-projects-view">{projectSwitcher}</div>
          ) : null}
          <div
            className="assistant-conversation"
            hidden={collapsed || projectsOpen}
            id="landing-chat"
          >
            <PanelBody
              isStreaming={isStreaming}
              onRetryTurn={onRetryTurn}
              onSuggestion={handleSuggestion}
              retryDisabled={isStreaming || connection !== 'live'}
              turns={turns}
            />
          </div>
          <div
            className="assistant-composer-region"
            hidden={projectsOpen}
            id="landing-composer"
          >
            <Composer
              attachmentError={attachmentError ?? draftError ?? null}
              attachments={attachments}
              canSelectElement={canSelectElement}
              disabled={
                isStreaming ||
                submitting ||
                !draftReady ||
                connection !== 'live' ||
                (prompt.trim().length === 0 && attachments.length === 0)
              }
              elementSelectionActive={elementSelectionActive}
              isStopping={isStopping}
              isStreaming={isStreaming}
              modelPricing={modelPricing}
              models={models}
              onAttachFiles={handleAttachFiles}
              onChange={setPrompt}
              onElementSelectionToggle={onElementSelectionToggle}
              onKeyDown={handleKeyDown}
              onLocateElement={(selector) => {
                onLocateElement(selector)
                if (window.innerWidth < 768) setPanelCollapsed(true)
              }}
              onModelsChange={onModelsChange}
              onRemoveAttachment={handleRemoveAttachment}
              onStop={onStop}
              onSubmit={handleSubmit}
              prompt={prompt}
              readOnly={!draftReady || submitting}
              turns={turns}
            />
          </div>
        </div>
        {collapsed ? null : (
          <>
            <PanelResizeHandle
              onKeyDown={handleResizeKeyDown}
              onResizeEnd={handleResizeEnd}
              onResizeMove={handleResizeMove}
              onResizeStart={handleResizeStart}
              side="left"
              width={keyboardWidth}
            />
            <PanelResizeHandle
              onKeyDown={handleResizeKeyDown}
              onResizeEnd={handleResizeEnd}
              onResizeMove={handleResizeMove}
              onResizeStart={handleResizeStart}
              side="right"
              width={keyboardWidth}
            />
          </>
        )}
      </section>
    </>
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
    x: Math.max(PANEL_MARGIN, window.innerWidth - width - PANEL_MARGIN),
    y: Math.max(PANEL_MARGIN, window.innerHeight - PANEL_HEIGHT - PANEL_MARGIN),
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
  onKeyDown,
  onResizeEnd,
  onResizeMove,
  onResizeStart,
  side,
  width,
}: {
  onKeyDown: (
    event: KeyboardEvent<HTMLDivElement>,
    side: 'left' | 'right',
  ) => void
  onResizeEnd: (event: ReactPointerEvent<HTMLElement>) => void
  onResizeMove: (event: ReactPointerEvent<HTMLElement>) => void
  onResizeStart: (
    event: ReactPointerEvent<HTMLElement>,
    side: 'left' | 'right',
  ) => void
  side: 'left' | 'right'
  width: number
}) {
  return (
    <div
      aria-controls="page-assistant"
      aria-label={
        side === 'left' ? 'Resize panel left edge' : 'Resize panel right edge'
      }
      aria-orientation="vertical"
      aria-valuemax={maxPanelWidth()}
      aria-valuemin={MIN_PANEL_WIDTH}
      aria-valuenow={width}
      className={cn(
        'absolute inset-y-0 z-40 w-1.5 cursor-col-resize touch-none hover:bg-accent/40',
        side === 'left' ? 'left-0' : 'right-0',
      )}
      onKeyDown={(event) => onKeyDown(event, side)}
      onLostPointerCapture={onResizeEnd}
      onPointerCancel={onResizeEnd}
      onPointerDown={(event) => onResizeStart(event, side)}
      onPointerMove={onResizeMove}
      onPointerUp={onResizeEnd}
      role="separator"
      tabIndex={0}
    />
  )
}

function promptAttachmentSize(attachment: PromptAttachmentInput) {
  return attachment.kind === 'element' ? 0 : attachment.size
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

  if (window.innerWidth < 768) return { x: state.x, y: state.y }
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
    let previousWidth = window.innerWidth
    let previousHeight = window.innerHeight
    const onResize = () => {
      // Phone presentation is CSS-owned. Preserve the desktop placement.
      if (window.innerWidth < 768) return
      const width = widthRef.current
      const docked =
        position.y === 0
          ? position.x === 0
            ? 'left'
            : position.x === Math.max(0, previousWidth - width)
              ? 'right'
              : null
          : null
      if (docked) {
        previousWidth = window.innerWidth
        previousHeight = window.innerHeight
        const x = docked === 'right' ? rightDockX(width) : 0
        if (x !== position.x) setPosition({ x, y: 0 })
        return
      }
      const atRight =
        Math.abs(position.x + width + PANEL_MARGIN - previousWidth) <=
        PANEL_MARGIN
      const atBottom =
        Math.abs(position.y + PANEL_HEIGHT + PANEL_MARGIN - previousHeight) <=
        PANEL_MARGIN
      const nextPosition = clampPanelPosition(
        {
          x: atRight
            ? Math.max(PANEL_MARGIN, window.innerWidth - width - PANEL_MARGIN)
            : position.x,
          y: atBottom
            ? Math.max(
                PANEL_MARGIN,
                window.innerHeight - PANEL_HEIGHT - PANEL_MARGIN,
              )
            : position.y,
        },
        collapsed,
        width,
      )
      previousWidth = window.innerWidth
      previousHeight = window.innerHeight
      if (nextPosition.x !== position.x || nextPosition.y !== position.y)
        setPosition(nextPosition)
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
