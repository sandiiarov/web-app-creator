import { Button } from '@workspace/ui/components/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@workspace/ui/components/tooltip'
import { cn } from '@workspace/ui/lib/utils'
import {
  Download,
  FolderOpen,
  GripVertical,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import { type PointerEvent as ReactPointerEvent } from 'react'

import { KeyboardShortcut } from './keyboard-shortcut'
import { KEYBOARD_SHORTCUTS } from './keyboard-shortcuts'
import {
  PanelLayoutMenu,
  PanelSettingsMenu,
  PreviewViewportMenu,
} from './panel-command-menu'
import type {
  PanelLayout,
  PanelStatus,
  PanelTheme,
  PreviewViewport,
} from './panel-constants'
import { StatusPill } from './status-pill'

export function PanelHeader({
  canDownload,
  collapsed,
  dragging,
  layout,
  onAllProjects,
  onDownloadHtml,
  onDragEnd,
  onDragMove,
  onDragStart,
  onLayoutChange,
  onPanelMenuOpenChange,
  onToggleCollapsed,
  onToggleTheme,
  onViewportChange,
  panelMenuOpen,
  status,
  theme,
  viewport,
}: {
  canDownload: boolean
  collapsed: boolean
  dragging: boolean
  layout: PanelLayout
  onAllProjects: () => void
  onDownloadHtml: () => void
  onDragEnd: () => void
  onDragMove: (event: ReactPointerEvent<HTMLDivElement>) => void
  onDragStart: (event: ReactPointerEvent<HTMLDivElement>) => void
  onLayoutChange: (layout: PanelLayout) => void
  onPanelMenuOpenChange: (open: boolean) => void
  onToggleCollapsed: () => void
  onToggleTheme: () => void
  onViewportChange: (viewport: PreviewViewport) => void
  panelMenuOpen: boolean
  status: PanelStatus
  theme: PanelTheme
  viewport: PreviewViewport
}) {
  return (
    <header
      className={cn(
        'shrink-0 border-b border-border/70',
        dragging ? 'cursor-grabbing' : 'cursor-grab',
      )}
      onPointerDown={onDragStart}
      onPointerMove={onDragMove}
      onPointerUp={onDragEnd}
    >
      <div className="flex h-9 items-center gap-2 px-2">
        <GripVertical
          aria-hidden="true"
          className="mr-1 size-3.5 shrink-0 cursor-grab text-muted-foreground/60"
          strokeWidth={2}
        />
        <StatusPill status={status} />
        <div
          className="ml-auto flex items-center gap-1"
          onPointerDown={(event) => event.stopPropagation()}
          onPointerMove={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={`Go to all projects. Shortcut ${KEYBOARD_SHORTCUTS.allProjects.title}`}
                onClick={onAllProjects}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <FolderOpen />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              All projects
              <KeyboardShortcut shortcut={KEYBOARD_SHORTCUTS.allProjects} />
            </TooltipContent>
          </Tooltip>
          <PreviewViewportMenu
            onViewportChange={onViewportChange}
            viewport={viewport}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="Download HTML"
                disabled={!canDownload}
                onClick={onDownloadHtml}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <Download />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Download HTML</TooltipContent>
          </Tooltip>
          <PanelLayoutMenu
            layout={layout}
            onLayoutChange={onLayoutChange}
            onOpenChange={onPanelMenuOpenChange}
            open={panelMenuOpen}
          />
          <PanelSettingsMenu onToggleTheme={onToggleTheme} theme={theme} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={collapsed ? 'Maximize panel' : 'Minimize panel'}
                onClick={onToggleCollapsed}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                {collapsed ? <Maximize2 /> : <Minimize2 />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {collapsed ? 'Maximize panel' : 'Minimize panel'}
              <KeyboardShortcut shortcut={KEYBOARD_SHORTCUTS.panelToggle} />
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </header>
  )
}
