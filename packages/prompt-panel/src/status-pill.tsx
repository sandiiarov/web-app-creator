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
  done: 'border-border bg-background text-muted-foreground',
  error: 'border-destructive/35 bg-destructive/10 text-destructive',
  generating: 'border-primary/35 bg-primary/15 text-primary',
  ready: 'border-border bg-background text-muted-foreground',
  stopped: 'border-border bg-background text-muted-foreground',
}

export function StatusDot({ status }: { status: PanelStatus }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'absolute top-1 right-1 size-1.5 rounded-none ring-2 ring-popover',
        DOT_CLASS[status],
      )}
    />
  )
}

export function StatusPill({ status }: { status: PanelStatus }) {
  return (
    <span
      className={cn(
        'inline-flex h-4 items-center rounded-none border px-1.5 text-[9px] font-semibold tracking-wide uppercase',
        PILL_VARIANT[status],
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}
