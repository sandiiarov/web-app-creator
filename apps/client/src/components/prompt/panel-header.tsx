import { cn } from '@workspace/ui/lib/utils'
import { GripVertical } from 'lucide-react'
import { type PointerEvent as ReactPointerEvent } from 'react'

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
          <PanelCommandMenu
            collapsed={collapsed}
            layout={layout}
            model={model}
            onLayoutChange={onLayoutChange}
            onModelChange={onModelChange}
            onOpenChange={onCommandMenuOpenChange}
            onToggleCollapsed={onToggleCollapsed}
            open={commandMenuOpen}
          />
        </div>
      </div>
    </header>
  )
}
