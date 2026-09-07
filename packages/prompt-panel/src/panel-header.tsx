import { Button } from '@workspace/ui/components/button'
import { ProgressBlob } from '@workspace/ui/components/progress-blob'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@workspace/ui/components/tooltip'
import { cn } from '@workspace/ui/lib/utils'
import { ArrowLeft, ChevronUp, FolderOpen, Minus } from 'lucide-react'
import { type KeyboardEvent, type ReactNode, type PointerEvent } from 'react'

import { KeyboardShortcut } from './keyboard-shortcut'
import { KEYBOARD_SHORTCUTS } from './keyboard-shortcuts'
import { PanelLayoutMenu } from './panel-command-menu'
import type { PanelLayout, PanelStatus, PanelTheme } from './panel-constants'
import { STATUS_LABELS } from './panel-constants'

export function PanelHeader({
  collapsed,
  compactionPercent,
  connection,
  dragging,
  layout,
  mobileExpanded,
  onAllProjects,
  onCompactionPercentChange,
  onDragEnd,
  onDragMove,
  onDragStart,
  onLauncherKeyDown,
  onLayoutChange,
  onMobileExpandedChange,
  onToggleCollapsed,
  onToggleTheme,
  pageActions,
  pageHeaderActions,
  projectsOpen,
  status,
  statusText,
  theme,
}: {
  collapsed: boolean
  compactionPercent: number
  connection: 'connecting' | 'live' | 'offline' | 'reconnecting'
  dragging: boolean
  layout: PanelLayout
  mobileExpanded: boolean
  onAllProjects: () => void
  onCompactionPercentChange: (percent: number) => void
  onDragEnd: (event: PointerEvent<HTMLElement>) => void
  onDragMove: (event: PointerEvent<HTMLElement>) => void
  onDragStart: (event: PointerEvent<HTMLElement>) => void
  onLauncherKeyDown?: (event: KeyboardEvent<HTMLElement>) => void
  onLayoutChange: (layout: PanelLayout) => void
  onMobileExpandedChange: (value: boolean) => void
  onToggleCollapsed: () => void
  onToggleTheme: () => void
  pageActions: ReactNode
  pageHeaderActions?: { refresh: ReactNode; viewport: ReactNode }
  projectsOpen: boolean
  status: PanelStatus
  statusText?: string
  theme: PanelTheme
}) {
  const label = statusText ?? STATUS_LABELS[status]

  return (
    <header
      className={cn(
        'panel-header',
        dragging ? 'cursor-grabbing' : 'cursor-grab',
      )}
      data-collapsed={collapsed}
      onLostPointerCapture={onDragEnd}
      onPointerCancel={onDragEnd}
      onPointerDown={(event) => {
        if (event.target instanceof Element && event.target.closest('button'))
          return
        onDragStart(event)
      }}
      onPointerMove={onDragMove}
      onPointerUp={onDragEnd}
    >
      <div className="panel-header-controls">
        <span
          aria-label={`Web App Creator. ${label}${collapsed ? '. Use arrow keys to move the panel.' : ''}`}
          className="assistant-logo"
          data-active={status === 'generating' && connection === 'live'}
          data-attention={status === 'error' || connection === 'offline'}
          data-panel-drag-handle=""
          onKeyDown={onLauncherKeyDown}
          role="img"
          tabIndex={collapsed ? 0 : undefined}
          title={`Web App Creator · ${label}`}
        >
          <ProgressBlob />
        </span>
        <span className="sr-only" role="status">
          {label}
        </span>
        <div
          className="ml-auto flex items-center gap-0.5"
          data-panel-actions=""
          onPointerDown={(event) => event.stopPropagation()}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-expanded={projectsOpen && !collapsed}
                aria-label={
                  projectsOpen && !collapsed
                    ? 'Back to conversation'
                    : 'Open projects'
                }
                onClick={onAllProjects}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                {projectsOpen && !collapsed ? <ArrowLeft /> : <FolderOpen />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {projectsOpen && !collapsed ? 'Back to conversation' : 'Projects'}
            </TooltipContent>
          </Tooltip>
          {pageHeaderActions?.refresh}
          <PanelLayoutMenu
            compactionPercent={compactionPercent}
            layout={layout}
            mobileExpanded={mobileExpanded}
            onCompactionPercentChange={onCompactionPercentChange}
            onLayoutChange={onLayoutChange}
            onMobileExpandedChange={onMobileExpandedChange}
            onToggleTheme={onToggleTheme}
            pageActions={pageActions}
            theme={theme}
          />
          {pageHeaderActions?.viewport}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-controls="landing-chat"
                aria-expanded={!collapsed}
                aria-label={
                  collapsed ? 'Show conversation' : 'Minimize conversation'
                }
                data-panel-toggle=""
                onClick={onToggleCollapsed}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                {collapsed ? <ChevronUp /> : <Minus />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {collapsed ? 'Show conversation' : 'Minimize conversation'}
              <KeyboardShortcut shortcut={KEYBOARD_SHORTCUTS.panelToggle} />
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </header>
  )
}
