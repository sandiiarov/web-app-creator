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
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { useNavigate } from 'react-router-dom'

import type { LandingTurn } from '../../lib/landing-agent'
import { Composer } from './composer'
import { KEYBOARD_SHORTCUTS } from './keyboard-shortcuts'
import { PanelBody } from './panel-body'
import {
  COLLAPSED_HEIGHT,
  PANEL_HEIGHT,
  PANEL_MARGIN,
  PANEL_WIDTH,
  type PanelLayout,
  type PanelPosition,
} from './panel-constants'
import { PanelHeader } from './panel-header'
import { panelStatus } from './panel-status'

const PANEL_POSITION_STORAGE_KEY = 'landing.promptPanel.position.v1'

export type PromptPanelProps = {
  isStreaming: boolean
  model: string
  onModelChange: (model: string) => void
  onSend: (prompt: string) => void
  onStop: () => void
  turns: LandingTurn[]
}

type StoredPanelState = Partial<PanelPosition> & {
  collapsed?: boolean
  layout?: PanelLayout
}

export function PromptPanel({
  isStreaming,
  model,
  onModelChange,
  onSend,
  onStop,
  turns,
}: PromptPanelProps) {
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(initialPanelCollapsed)
  const [commandMenuOpen, setCommandMenuOpen] = useState(false)
  const [position, setPosition] = useState<PanelPosition>(initialPanelPosition)
  const [prompt, setPrompt] = useState('')
  const [dragging, setDragging] = useState(false)

  const dragStart = useRef<null | { offsetX: number; offsetY: number }>(null)

  useClampToViewport(position, setPosition, collapsed)

  useEffect(() => {
    writeStoredPanelState(position, collapsed)
  }, [collapsed, position])

  const handleDragStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('button, input, textarea, a, [role="button"]')
      ) {
        return
      }

      setDragging(true)
      dragStart.current = {
        offsetX: event.clientX - position.x,
        offsetY: event.clientY - position.y,
      }
      ;(event.target as HTMLElement).setPointerCapture?.(event.pointerId)
    },
    [position.x, position.y],
  )

  const handleDragMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragging || !dragStart.current) {
        return
      }

      setPosition({
        x: event.clientX - dragStart.current.offsetX,
        y: event.clientY - dragStart.current.offsetY,
      })
    },
    [dragging],
  )

  const handleDragEnd = useCallback(() => {
    setDragging(false)
    dragStart.current = null
  }, [])

  const handleLayoutChange = useCallback(
    (nextLayout: PanelLayout) => {
      if (nextLayout === 'left-sidebar') {
        setPosition({ x: 0, y: 0 })
        return
      }

      if (nextLayout === 'right-sidebar') {
        setPosition({ x: rightDockX(), y: 0 })
        return
      }

      setPosition(floatingPositionFrom(position))
    },
    [position],
  )

  const handleAllProjects = useCallback(() => {
    navigate('/')
  }, [navigate])

  const handleCommandMenuHotkey = useCallback(() => {
    setCommandMenuOpen(true)
  }, [])

  const sendPrompt = useCallback(() => {
    const trimmed = prompt.trim()

    if (!trimmed || isStreaming) {
      return
    }

    onSend(trimmed)
    setPrompt('')
  }, [isStreaming, onSend, prompt])

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
  useHotkeys(
    KEYBOARD_SHORTCUTS.panelCommand.hotkey,
    () => handleCommandMenuHotkey(),
    { enableOnFormTags: true, preventDefault: true },
    [handleCommandMenuHotkey],
  )

  const dockedSide = dockedPanelSide(position)
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
    width: `min(${PANEL_WIDTH}px, 100vw)`,
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
        dragging ? 'select-none' : '',
      )}
      style={panelStyle}
    >
      {shouldRenderCollapsed ? (
        <PanelHeader
          collapsed={collapsed}
          commandMenuOpen={commandMenuOpen}
          dragging={dragging}
          layout={layout}
          onAllProjects={handleAllProjects}
          onCommandMenuOpenChange={setCommandMenuOpen}
          onDragEnd={handleDragEnd}
          onDragMove={handleDragMove}
          onDragStart={handleDragStart}
          onLayoutChange={handleLayoutChange}
          onToggleCollapsed={() => setCollapsed(false)}
          status={status}
        />
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          <PanelHeader
            collapsed={collapsed}
            commandMenuOpen={commandMenuOpen}
            dragging={dragging}
            layout={layout}
            onAllProjects={handleAllProjects}
            onCommandMenuOpenChange={setCommandMenuOpen}
            onDragEnd={handleDragEnd}
            onDragMove={handleDragMove}
            onDragStart={handleDragStart}
            onLayoutChange={handleLayoutChange}
            onToggleCollapsed={() => setCollapsed(true)}
            status={status}
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
                disabled={isStreaming || prompt.trim().length === 0}
                isStreaming={isStreaming}
                model={model}
                onChange={setPrompt}
                onKeyDown={handleKeyDown}
                onModelChange={onModelChange}
                onStop={onStop}
                onSubmit={handleSubmit}
                prompt={prompt}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      )}
    </section>
  )
}

function clampPanelPosition(
  position: PanelPosition,
  collapsed: boolean,
): PanelPosition {
  const dockedSide = dockedPanelSide(position)
  const height = collapsed
    ? COLLAPSED_HEIGHT
    : dockedSide
      ? window.innerHeight
      : PANEL_HEIGHT
  const maxX = rightDockX()
  const maxY = Math.max(0, window.innerHeight - height)
  const x = dockedSide === 'right' ? maxX : Math.min(position.x, maxX)
  const y = Math.min(position.y, maxY)

  return {
    x: Math.max(0, x),
    y: Math.max(0, y),
  }
}

function defaultPanelPosition(): PanelPosition {
  return {
    x: Math.max(
      PANEL_MARGIN,
      Math.min(32, window.innerWidth - PANEL_WIDTH - PANEL_MARGIN),
    ),
    y: Math.max(
      PANEL_MARGIN,
      Math.min(32, window.innerHeight - PANEL_HEIGHT - PANEL_MARGIN),
    ),
  }
}

function dockedPanelSide(position: PanelPosition) {
  if (position.y !== 0) {
    return null
  }

  if (position.x === 0) {
    return 'left'
  }

  if (position.x === rightDockX()) {
    return 'right'
  }

  return null
}

function floatingPositionFrom(position: PanelPosition): PanelPosition {
  const dockedSide = dockedPanelSide(position)

  if (dockedSide === 'left') {
    return { x: 16, y: 16 }
  }

  if (dockedSide === 'right') {
    return { x: Math.max(0, rightDockX() - 16), y: 16 }
  }

  return defaultPanelPosition()
}

function initialPanelCollapsed(): boolean {
  return readStoredPanelCollapsed() ?? false
}

function initialPanelPosition(): PanelPosition {
  return readStoredPanelPosition() ?? defaultPanelPosition()
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function readStoredPanelCollapsed(): boolean | null {
  const collapsed = readStoredPanelState()?.collapsed
  return typeof collapsed === 'boolean' ? collapsed : null
}

function readStoredPanelPosition(): null | PanelPosition {
  const state = readStoredPanelState()
  if (!state) return null
  if (!isFiniteNumber(state.x) || !isFiniteNumber(state.y)) return null

  if (state.layout === 'left-sidebar') return { x: 0, y: 0 }
  if (state.layout === 'right-sidebar') return { x: rightDockX(), y: 0 }

  return clampPanelPosition({ x: state.x, y: state.y }, false)
}

function readStoredPanelState(): null | StoredPanelState {
  try {
    const raw = window.localStorage.getItem(PANEL_POSITION_STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }

    return parsed as StoredPanelState
  } catch {
    return null
  }
}

function rightDockX() {
  return Math.max(
    0,
    window.innerWidth - Math.min(PANEL_WIDTH, window.innerWidth),
  )
}

function useClampToViewport(
  position: PanelPosition,
  setPosition: (next: PanelPosition) => void,
  collapsed: boolean,
) {
  useEffect(() => {
    const onResize = () => {
      const nextPosition = clampPanelPosition(position, collapsed)

      if (nextPosition.x !== position.x || nextPosition.y !== position.y) {
        setPosition(nextPosition)
      }
    }

    onResize()
    window.addEventListener('resize', onResize)

    return () => window.removeEventListener('resize', onResize)
  }, [collapsed, position, setPosition])
}

function writeStoredPanelState(position: PanelPosition, collapsed: boolean) {
  try {
    const dockedSide = dockedPanelSide(position)
    const layout: PanelLayout = dockedSide
      ? `${dockedSide}-sidebar`
      : 'floating'

    window.localStorage.setItem(
      PANEL_POSITION_STORAGE_KEY,
      JSON.stringify({ ...position, collapsed, layout }),
    )
  } catch {
    // Ignore storage errors from private mode or blocked localStorage.
  }
}
