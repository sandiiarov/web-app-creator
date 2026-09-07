import { Button } from '@workspace/ui/components/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@workspace/ui/components/tooltip'
import { cn } from '@workspace/ui/lib/utils'
import {
  ArrowLeft,
  Check,
  ChevronUp,
  CircleAlert,
  FolderOpen,
  LoaderCircle,
  Minus,
  Pause,
  WifiOff,
} from 'lucide-react'
import { type ReactNode, type PointerEvent } from 'react'

import { KeyboardShortcut } from './keyboard-shortcut'
import { KEYBOARD_SHORTCUTS } from './keyboard-shortcuts'
import { PanelLayoutMenu, PanelSettingsMenu } from './panel-command-menu'
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
  onLayoutChange,
  onMobileExpandedChange,
  onPanelMenuOpenChange,
  onToggleCollapsed,
  onToggleTheme,
  pageActions,
  panelMenuOpen,
  projectsOpen,
  projectTitle,
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
  onLayoutChange: (layout: PanelLayout) => void
  onMobileExpandedChange: (value: boolean) => void
  onPanelMenuOpenChange: (open: boolean) => void
  onToggleCollapsed: () => void
  onToggleTheme: () => void
  pageActions: ReactNode
  panelMenuOpen: boolean
  projectsOpen: boolean
  projectTitle: string
  status: PanelStatus
  statusText?: string
  theme: PanelTheme
}) {
  const label = statusText ?? STATUS_LABELS[status]
  const busy =
    connection === 'connecting' ||
    connection === 'reconnecting' ||
    status === 'generating'
  const StatusIcon =
    connection === 'offline'
      ? WifiOff
      : busy
        ? LoaderCircle
        : status === 'error'
          ? CircleAlert
          : status === 'stopped'
            ? Pause
            : Check
  return (
    <header
      className={cn(
        'panel-header',
        dragging ? 'cursor-grabbing' : 'cursor-grab',
      )}
      onLostPointerCapture={onDragEnd}
      onPointerCancel={onDragEnd}
      onPointerDown={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest('button') &&
          !event.target.closest('[data-panel-drag-handle]')
        )
          return
        onDragStart(event)
      }}
      onPointerMove={onDragMove}
      onPointerUp={onDragEnd}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-expanded={projectsOpen}
            aria-label={projectsOpen ? 'Back to conversation' : 'Open projects'}
            onClick={onAllProjects}
            size="icon-sm"
            variant="ghost"
          >
            {projectsOpen ? <ArrowLeft /> : <FolderOpen />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {projectsOpen ? 'Back to conversation' : 'Projects'}
        </TooltipContent>
      </Tooltip>
      <h1
        aria-label={projectTitle}
        className="min-w-0 flex-1"
        id="assistant-title"
        title={projectTitle}
      >
        <span
          className="assistant-project-title"
          data-panel-drag-handle=""
          title="Drag to move"
        >
          <span className="truncate">
            {projectTitle === 'Untitled' ? 'New project' : projectTitle}
          </span>
        </span>
      </h1>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            aria-label={label}
            className="assistant-connection"
            data-connection={connection}
            data-status={status}
            onPointerDown={(event) => event.stopPropagation()}
            role="status"
            tabIndex={0}
          >
            <StatusIcon
              aria-hidden="true"
              className={cn(
                'size-3.5',
                busy && connection !== 'offline' && 'animate-spin',
              )}
            />
          </span>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <div
        className="flex items-center gap-0.5"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <PanelLayoutMenu
          layout={layout}
          mobileExpanded={mobileExpanded}
          onLayoutChange={onLayoutChange}
          onMobileExpandedChange={onMobileExpandedChange}
          onOpenChange={onPanelMenuOpenChange}
          open={panelMenuOpen}
        />
        <PanelSettingsMenu
          compactionPercent={compactionPercent}
          onCompactionPercentChange={onCompactionPercentChange}
          onToggleTheme={onToggleTheme}
          pageActions={pageActions}
          theme={theme}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-controls="landing-chat"
              aria-expanded={!collapsed}
              aria-label={
                collapsed ? 'Show conversation' : 'Minimize conversation'
              }
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
    </header>
  )
}
