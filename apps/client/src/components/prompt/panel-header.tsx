import { Button } from '@workspace/ui/components/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@workspace/ui/components/tooltip'
import { cn } from '@workspace/ui/lib/utils'
import { FolderOpen, GripVertical, Maximize2, Minimize2 } from 'lucide-react'
import { type PointerEvent as ReactPointerEvent } from 'react'
import { Link } from 'react-router-dom'

import { KeyboardShortcut } from './keyboard-shortcut'
import { KEYBOARD_SHORTCUTS } from './keyboard-shortcuts'
import { PanelCommandMenu } from './panel-command-menu'
import type { PanelLayout, PanelStatus } from './panel-constants'
import { StatusPill } from './status-pill'

export function PanelHeader({
  collapsed,
  commandMenuOpen,
  dragging,
  layout,
  model,
  onCommandMenuOpenChange,
  onDragEnd,
  onDragMove,
  onDragStart,
  onLayoutChange,
  onModelChange,
  onToggleCollapsed,
  status,
}: {
  collapsed: boolean
  commandMenuOpen: boolean
  dragging: boolean
  layout: PanelLayout
  model: string
  onCommandMenuOpenChange: (open: boolean) => void
  onDragEnd: () => void
  onDragMove: (event: ReactPointerEvent<HTMLDivElement>) => void
  onDragStart: (event: ReactPointerEvent<HTMLDivElement>) => void
  onLayoutChange: (layout: PanelLayout) => void
  onModelChange: (model: string) => void
  onToggleCollapsed: () => void
  status: PanelStatus
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
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button asChild size="icon-sm" variant="ghost">
                  <Link
                    aria-label={`Go to all projects. Shortcut ${KEYBOARD_SHORTCUTS.allProjects.title}`}
                    to="/"
                  >
                    <FolderOpen />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                All projects
                <KeyboardShortcut shortcut={KEYBOARD_SHORTCUTS.allProjects} />
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
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
          </TooltipProvider>
          <PanelCommandMenu
            layout={layout}
            model={model}
            onLayoutChange={onLayoutChange}
            onModelChange={onModelChange}
            onOpenChange={onCommandMenuOpenChange}
            open={commandMenuOpen}
          />
        </div>
      </div>
    </header>
  )
}
