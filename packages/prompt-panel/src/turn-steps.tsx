import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@workspace/ui/components/collapsible'
import { MarkerIcon } from '@workspace/ui/components/marker'
import { Separator } from '@workspace/ui/components/separator'
import { cn } from '@workspace/ui/lib/utils'
import type { LucideIcon } from 'lucide-react'
import {
  Camera,
  ChevronRight,
  FileText,
  Globe,
  Image,
  Pencil,
  Search,
  Wrench,
} from 'lucide-react'
import { useState } from 'react'

import type { ToolCallPart, ToolCallState } from './domain'

const TOOL_ICONS: Record<string, LucideIcon> = {
  analyze_image: Image,
  edit: Pencil,
  find: Search,
  generate_image: Image,
  grep: Search,
  read: FileText,
  scrape: Globe,
  screenshot: Camera,
  skill: Wrench,
  skill_read: Wrench,
  skill_search: Wrench,
}

const TOOL_LABELS: Record<string, string> = {
  analyze_image: 'Analyze image',
  edit: 'Edit',
  find: 'Find',
  generate_image: 'Generate image',
  grep: 'Grep',
  read: 'Read',
  scrape: 'Scrape',
  screenshot: 'Screenshot',
  skill: 'Skill',
  skill_read: 'Skill',
  skill_search: 'Skill search',
}

export function TurnToolBlock({ step }: { step: ToolCallPart }) {
  const [open, setOpen] = useState(false)
  const args = argsFromDetail(step)
  const Icon = TOOL_ICONS[step.tool] ?? Wrench
  const action = displayIntent(step)
  const isActive = isActiveState(step.state)
  const isError = step.state === 'error'
  const label = toolLabel(step.tool)
  const result = normalizeText(step.result)
  const resultBody = result ?? resultFallback(step.state)

  return (
    <Collapsible
      className={toolShellClassName(step.state)}
      onOpenChange={setOpen}
      open={open}
    >
      <CollapsibleTrigger asChild>
        <button
          aria-label={`${open ? 'Hide' : 'Show'} ${label} details: ${action}`}
          className={toolTriggerClassName}
          type="button"
        >
          <ToolIcon Icon={Icon} state={step.state} />
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                'block text-left text-xs leading-tight font-semibold text-foreground',
                isError && 'text-destructive',
              )}
            >
              {label}
            </span>
            <span
              className={cn(
                'mt-1 text-left text-xs leading-snug wrap-break-word whitespace-pre-wrap text-muted-foreground',
                isError && 'text-destructive/85',
              )}
            >
              {action}
            </span>
            <span className="sr-only">{stateLabel(step.state)}</span>
          </span>
          <DisclosureIcon open={open} state={step.state} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Separator className={cn(isError && 'bg-destructive/30')} />
        <div className="flex flex-col gap-2 p-2.5">
          {args ? <ToolSection label="Args">{args}</ToolSection> : null}
          {args ? (
            <Separator
              className={cn('opacity-60', isError && 'bg-destructive/25')}
            />
          ) : null}
          {resultBody ? (
            <ToolSection
              label={isError ? 'Error' : 'Result'}
              tone={isError ? 'error' : result ? 'default' : 'muted'}
            >
              {resultBody}
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

function argsFromDetail(step: ToolCallPart) {
  const detail = normalizeText(step.detail)
  if (!detail) return null

  const explicitIntent = normalizeText(step.action)
  const lines = detail
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (explicitIntent) {
    return lines[0] === explicitIntent
      ? lines.slice(1).join('\n') || null
      : detail
  }

  if (step.tool.startsWith('skill')) return detail

  const [firstLine, ...remainingLines] = lines
  if (firstLine && /^[A-Za-z][A-Za-z ]+:/.test(firstLine)) return detail

  return remainingLines.join('\n') || null
}

function detailValue(detail: null | string | undefined, label: string) {
  const prefix = `${label}:`
  return (
    detail
      ?.split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith(prefix))
      ?.slice(prefix.length)
      .trim() || null
  )
}

function DisclosureIcon({
  open,
  state,
}: {
  open: boolean
  state: ToolCallState
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'mt-0.5 ml-auto inline-flex shrink-0 items-center text-muted-foreground transition-colors',
        isActiveState(state) && 'text-amber-700 dark:text-amber-300',
        state === 'error' && 'text-destructive',
      )}
    >
      <ChevronRight
        className={cn('size-3.5 transition-transform', open && 'rotate-90')}
      />
    </span>
  )
}

function displayIntent(step: ToolCallPart) {
  const explicitIntent = normalizeText(step.action)
  if (explicitIntent) return explicitIntent

  const detail = normalizeText(step.detail)
  const skillName = detailValue(detail, 'Skill')
  const reference = detailValue(detail, 'Reference')
  const query = detailValue(detail, 'Query')
  const skills = detailValue(detail, 'Skills')

  if (step.tool === 'skill_read') {
    return (
      [skillName, reference].filter(Boolean).join(' · ') ||
      'Read skill reference'
    )
  }

  if (step.tool === 'skill_search') {
    return [query, skills].filter(Boolean).join(' · ') || 'Search skills'
  }

  if (step.tool === 'skill') {
    return skillName ?? detail ?? 'Load skill'
  }

  const firstLine = detail
    ?.split('\n')
    .map((line) => line.trim())
    .find(Boolean)
  if (firstLine && !/^[A-Za-z][A-Za-z ]+:/.test(firstLine)) return firstLine

  return `${toolLabel(step.tool)} tool call`
}

function humanizeToolName(tool: string) {
  return tool
    .split(/[_-]+/g)
    .filter(Boolean)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(' ')
}

function isActiveState(state: ToolCallState) {
  return state === 'running' || state === 'start'
}

function normalizeText(text: null | string | undefined) {
  const trimmed = text?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : null
}

function resultFallback(state: ToolCallState) {
  if (isActiveState(state)) return 'Waiting for result…'
  if (state === 'error') return 'Tool failed without details.'
  return 'No result returned.'
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

function ToolBodyText({
  children,
  tone = 'default',
}: {
  children: string
  tone?: 'default' | 'error' | 'muted'
}) {
  return (
    <span
      className={cn(
        'text-xs leading-relaxed wrap-break-word whitespace-pre-wrap text-muted-foreground',
        tone === 'default' && 'text-foreground/85',
        tone === 'error' && 'text-destructive',
      )}
    >
      {children}
    </span>
  )
}

function ToolIcon({ Icon, state }: { Icon: LucideIcon; state: ToolCallState }) {
  return (
    <MarkerIcon
      className={cn(
        'mt-0.5 text-muted-foreground transition-colors',
        isActiveState(state) && 'text-amber-700 dark:text-amber-300',
        state === 'error' && 'text-destructive',
      )}
    >
      <Icon />
    </MarkerIcon>
  )
}

function toolLabel(tool: string) {
  return TOOL_LABELS[tool] ?? humanizeToolName(tool)
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
      <ToolBodyText tone={tone}>{children}</ToolBodyText>
    </div>
  )
}

function toolShellClassName(state: ToolCallState) {
  return cn(
    'overflow-hidden rounded-none border bg-background/50',
    state === 'error'
      ? 'border-destructive/45 bg-destructive/10 dark:bg-destructive/15'
      : isActiveState(state)
        ? 'border-amber-500/45 bg-amber-500/10'
        : state === 'done'
          ? 'border-border/70 bg-muted/10'
          : 'border-border/60',
  )
}

const toolTriggerClassName = cn(
  'group/diagnostic flex min-h-10 w-full items-start gap-2 px-2.5 py-2 text-left text-[11px] text-muted-foreground transition-colors',
  'hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:outline-none',
)
