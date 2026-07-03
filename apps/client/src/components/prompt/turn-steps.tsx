import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@workspace/ui/components/collapsible'
import {
  Marker,
  MarkerContent,
  MarkerIcon,
} from '@workspace/ui/components/marker'
import { Separator } from '@workspace/ui/components/separator'
import { cn } from '@workspace/ui/lib/utils'
import type { LucideIcon } from 'lucide-react'
import {
  BookOpen,
  Camera,
  Check,
  ChevronRight,
  CircleAlert,
  FileText,
  Globe,
  Image,
  LoaderCircle,
  Pencil,
  Search,
  Sparkles,
  Wrench,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import type { ToolCallPart, ToolCallState } from '../../lib/landing-agent'

const TOOL_ICONS: Record<string, LucideIcon> = {
  analyze_image: Image,
  edit: Pencil,
  generate_image: Sparkles,
  grep: Search,
  read: FileText,
  scrape: Globe,
  screenshot: Camera,
  skill: Wrench,
  skill_read: BookOpen,
  skill_search: Search,
}

export function TurnToolBlock({ step }: { step: ToolCallPart }) {
  const isActive = step.state === 'running' || step.state === 'start'
  const isError = step.state === 'error'
  const [open, setOpen] = useState(isActive)
  const { args, intent } = splitToolDisplay(step)
  const result = normalizeText(step.result)
  const hasMoreDetails = Boolean(args || result || isActive)
  const Icon = TOOL_ICONS[step.tool] ?? Wrench

  useEffect(() => {
    setOpen(isActive)
  }, [isActive])

  return (
    <Collapsible
      className={cn(
        'overflow-hidden rounded-none border bg-background/50',
        isError
          ? 'border-destructive/45 bg-destructive/10 dark:bg-destructive/15'
          : isActive
            ? 'border-primary/35 bg-primary/5'
            : 'border-border/60',
      )}
      onOpenChange={setOpen}
      open={open}
    >
      <CollapsibleTrigger asChild>
        <Marker
          asChild
          className={cn(
            'min-h-9 px-2 py-1.5 text-[11px] transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:outline-none',
          )}
        >
          <button
            aria-label={`${open ? 'Hide' : 'Show'} tool details: ${intent}`}
            type="button"
          >
            <MarkerIcon
              className={cn(
                'text-muted-foreground transition-colors',
                isActive && 'text-primary',
                isError && 'text-destructive',
              )}
            >
              <Icon />
            </MarkerIcon>
            <MarkerContent className="flex min-w-0 flex-1 items-center gap-2">
              <span
                className={cn(
                  'truncate font-medium text-foreground',
                  isError && 'text-destructive',
                )}
              >
                {intent}
              </span>
              <span className="sr-only">{stateLabel(step.state)}</span>
            </MarkerContent>
            <span
              aria-hidden="true"
              className={cn(
                'ml-auto inline-flex size-3.5 shrink-0 items-center justify-center text-muted-foreground transition-colors',
                isActive && 'text-primary',
                isError && 'text-destructive',
              )}
            >
              <StateIcon open={open} state={step.state} />
            </span>
          </button>
        </Marker>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Separator className={cn(isError && 'bg-destructive/30')} />
        <div className="flex flex-col gap-2 p-2">
          <ToolSection label="Intent">{intent}</ToolSection>
          {hasMoreDetails ? (
            <Separator
              className={cn('opacity-60', isError && 'bg-destructive/25')}
            />
          ) : null}
          {args ? <ToolSection label="Args">{args}</ToolSection> : null}
          {args && (result || isActive) ? (
            <Separator
              className={cn('opacity-60', isError && 'bg-destructive/25')}
            />
          ) : null}
          {result ? (
            <ToolSection
              label={isError ? 'Error' : 'Result'}
              tone={isError ? 'error' : 'default'}
            >
              {result}
            </ToolSection>
          ) : isActive ? (
            <ToolSection label="Result" tone="muted">
              Waiting for result…
            </ToolSection>
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function normalizeText(text: null | string | undefined) {
  const trimmed = text?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : null
}

function splitToolDisplay(step: ToolCallPart): {
  args: null | string
  intent: string
} {
  const intent = normalizeText(step.intent)
  const detail = normalizeText(step.detail)

  if (!detail) {
    return { args: null, intent: intent ?? 'Working on the page' }
  }

  const lines = detail
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (intent) {
    const args = lines[0] === intent ? lines.slice(1).join('\n') : detail
    return { args: args || null, intent }
  }

  const [firstLine, ...remainingLines] = lines
  return {
    args: remainingLines.join('\n') || null,
    intent: firstLine ?? 'Working on the page',
  }
}

function StateIcon({ open, state }: { open: boolean; state: ToolCallState }) {
  if (state === 'running' || state === 'start') {
    return <LoaderCircle className="size-3.5 animate-spin" />
  }

  if (state === 'error') {
    return <CircleAlert className="size-3.5" />
  }

  if (open) {
    return <ChevronRight className="size-3.5 rotate-90 transition-transform" />
  }

  if (state === 'done') {
    return <Check className="size-3.5" />
  }

  return <ChevronRight className="size-3.5 transition-transform" />
}

function stateLabel(state: ToolCallState) {
  switch (state) {
    case 'done':
      return 'Done'
    case 'error':
      return 'Failed'
    case 'running':
      return 'Running'
    case 'start':
      return 'Starting'
  }
}

function ToolSection({
  children,
  label,
  tone = 'default',
}: {
  children: string
  label: string
  tone?: 'default' | 'error' | 'muted'
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] leading-none font-medium tracking-[0.12em] text-muted-foreground/70 uppercase">
        {label}
      </span>
      <span
        className={cn(
          'text-[11px] leading-relaxed wrap-break-word whitespace-pre-wrap text-muted-foreground',
          tone === 'default' && 'text-foreground/85',
          tone === 'error' && 'text-destructive',
        )}
      >
        {children}
      </span>
    </div>
  )
}
