import { cn } from '@workspace/ui/lib/utils'

import { STATUS_LABELS, type PanelStatus } from './panel-constants'

const DOT_CLASS: Record<PanelStatus, string> = {
  done: 'bg-foreground',
  error: 'bg-destructive',
  generating: 'bg-primary',
  ready: 'bg-muted-foreground',
  stopped: 'bg-muted-foreground',
}

const PILL_VARIANT: Record<PanelStatus, string> = {
  done: 'border-success/20 bg-success/10 text-success-foreground',
  error: 'border-destructive/35 bg-destructive/10 text-destructive',
  generating: 'border-info/20 bg-info/10 text-info-foreground',
  ready: 'border-border bg-muted/40 text-muted-foreground',
  stopped: 'border-border bg-background text-muted-foreground',
}

export function StatusDot({ status }: { status: PanelStatus }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'absolute top-1 right-1 size-1.5 rounded-full ring-2 ring-popover',
        DOT_CLASS[status],
      )}
    />
  )
}

export function StatusPill({ status }: { status: PanelStatus }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-sm border px-2 text-xs font-medium whitespace-nowrap',
        PILL_VARIANT[status],
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}
