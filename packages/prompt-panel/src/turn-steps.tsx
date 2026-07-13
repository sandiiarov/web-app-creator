import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@workspace/ui/components/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
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
  ListChecks,
  LoaderCircle,
  Monitor,
  Pencil,
  Search,
  Smartphone,
  Tablet,
  Wrench,
} from 'lucide-react'
import { type ReactNode, useState } from 'react'

import type { ToolCallImage, ToolCallPart, ToolCallState } from './domain'

const TOOL_ICONS: Record<string, LucideIcon> = {
  analyze_image: Image,
  edit: Pencil,
  find: Search,
  generate_image: Image,
  grep: Search,
  plan: ListChecks,
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
  plan: 'Plan',
  read: 'Read',
  scrape: 'Scrape',
  screenshot: 'Screenshot',
  skill: 'Skill',
  skill_read: 'Skill',
  skill_search: 'Skill search',
}

export function ToolArgsImages({ images }: { images: ToolCallImage[] }) {
  if (images.length === 0) return null

  return (
    <div
      className={cn(
        'grid gap-1.5',
        images.length > 1 ? 'grid-cols-2' : 'grid-cols-1',
      )}
    >
      {images.map((image, index) => (
        <ImageThumbnail image={image} key={`${image.url}-${index}`} />
      ))}
    </div>
  )
}

export function TurnToolBlock({ step }: { step: ToolCallPart }) {
  const [open, setOpen] = useState(false)
  if (step.tool === 'plan') return <PlanBlock step={step} />
  const args = argsFromDetail(step)
  const images = renderableToolImages(step.images)
  const hasArgs = !!args || images.length > 0
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
          {hasArgs ? (
            <ToolSection label="Args">
              {args ? <ToolBodyText>{args}</ToolBodyText> : null}
              <ToolArgsImages images={images} />
            </ToolSection>
          ) : null}
          {hasArgs ? (
            <Separator
              className={cn('opacity-60', isError && 'bg-destructive/25')}
            />
          ) : null}
          {resultBody ? (
            <ToolSection label={isError ? 'Error' : 'Result'}>
              <ToolBodyText
                tone={isError ? 'error' : result ? 'default' : 'muted'}
              >
                {resultBody}
              </ToolBodyText>
            </ToolSection>
          ) : isActive ? (
            <ToolSection label="Result">
              <ToolBodyText tone="muted">Waiting for result…</ToolBodyText>
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
        isActiveState(state) && 'text-sky-700 dark:text-sky-300',
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

function ImageThumbnail({ image }: { image: ToolCallImage }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <figure className="group/thumb min-w-0">
        <button
          className="block w-full cursor-zoom-in"
          onClick={() => setOpen(true)}
          type="button"
        >
          <img
            alt={image.alt}
            className="max-h-40 w-full border border-border/70 bg-muted/20 object-contain transition-opacity hover:opacity-90"
            loading="lazy"
            src={image.url}
          />
        </button>
        <figcaption className="mt-1 flex items-center justify-center gap-1 text-[10px] leading-tight text-muted-foreground/75">
          <ViewportBadge alt={image.alt} />
        </figcaption>
      </figure>
      <DialogContent
        // className="max-w-[90vw] gap-0 border-border/70 p-1 sm:max-w-200"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{image.alt}</DialogTitle>
        </DialogHeader>
        <DialogDescription>
          <img
            alt={image.alt}
            className="max-h-[80vh] w-full object-contain"
            src={image.url}
          />
        </DialogDescription>
      </DialogContent>
    </Dialog>
  )
}

function isActiveState(state: ToolCallState) {
  return state === 'running' || state === 'start'
}

function isRenderableImageSrc(src: string) {
  return (
    /^https?:\/\//i.test(src) ||
    /^\/[^/]/.test(src) ||
    /^data:image\/(?:gif|jpeg|png|webp);base64,/i.test(src)
  )
}

function normalizeText(text: null | string | undefined) {
  const trimmed = text?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : null
}

function planActions(result: null | string | undefined): string[] {
  const text = normalizeText(result)
  if (!text) return []
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

function PlanBlock({ step }: { step: ToolCallPart }) {
  const actions = planActions(step.result)
  const isActive = isActiveState(step.state)
  const isError = step.state === 'error'
  return (
    <div className={cn(toolShellClassName(step.state), 'px-2.5 py-2')}>
      <div className="flex items-start gap-2">
        <ToolIcon Icon={TOOL_ICONS.plan ?? Wrench} state={step.state} />
        <div className="min-w-0 flex-1">
          <span
            className={cn(
              'block text-xs leading-tight font-semibold text-foreground',
              isError && 'text-destructive',
            )}
          >
            Plan
          </span>
          {actions.length > 0 ? (
            <ol className="mt-1.5 flex flex-col gap-1.5">
              {actions.map((action, index) => (
                <li
                  className="flex min-w-0 items-start gap-2"
                  key={`${index}-${action.slice(0, 12)}`}
                >
                  <span className="mt-px inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] leading-none font-semibold text-muted-foreground">
                    {index + 1}
                  </span>
                  <span className="min-w-0 text-left text-xs leading-snug wrap-break-word text-foreground/85">
                    {action}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <span className="mt-1 block text-xs leading-snug text-muted-foreground">
              {isActive ? 'Planning…' : isError ? 'Plan failed.' : 'No plan returned.'}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function renderableToolImages(images: ToolCallImage[] | undefined) {
  return (images ?? []).filter(
    (image) =>
      normalizeText(image.alt) !== null && isRenderableImageSrc(image.url),
  )
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
  const active = isActiveState(state)
  return (
    <MarkerIcon
      className={cn(
        'mt-0.5 text-muted-foreground transition-colors',
        active && 'text-sky-700 dark:text-sky-300',
        state === 'error' && 'text-destructive',
      )}
    >
      {active ? <LoaderCircle className="animate-spin" /> : <Icon />}
    </MarkerIcon>
  )
}

function toolLabel(tool: string) {
  return TOOL_LABELS[tool] ?? humanizeToolName(tool)
}

function ToolSection({
  children,
  label,
}: {
  children: ReactNode
  label: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] leading-none font-medium tracking-[0.12em] text-muted-foreground/70 uppercase">
        {label}
      </span>
      {children}
    </div>
  )
}

function toolShellClassName(state: ToolCallState) {
  return cn(
    'overflow-hidden rounded-none border bg-background/50',
    state === 'error'
      ? 'border-destructive/45 bg-destructive/10 dark:bg-destructive/15'
      : isActiveState(state)
        ? 'border-sky-500/45 bg-sky-500/10'
        : state === 'done'
          ? 'border-border/70 bg-muted/10'
          : 'border-border/60',
  )
}

function ViewportBadge({ alt }: { alt: string }) {
  const viewport = viewportFromAlt(alt)
  if (!viewport) return null
  const Icon =
    viewport === 'mobile'
      ? Smartphone
      : viewport === 'tablet'
        ? Tablet
        : Monitor
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] leading-none text-muted-foreground capitalize">
      <Icon className="size-3" />
      {viewport}
    </span>
  )
}

/** Extract a short viewport label (mobile/tablet/desktop) from an alt string
 *  like "Screenshot of body at mobile viewport" or "Element #hero (tablet)". */
function viewportFromAlt(alt: string): null | string {
  const match = alt.match(/\b(mobile|tablet|desktop)\b/i)
  return match?.[1]?.toLowerCase() ?? null
}

const toolTriggerClassName = cn(
  'group/diagnostic flex min-h-10 w-full items-start gap-2 px-2.5 py-2 text-left text-[11px] text-muted-foreground transition-colors',
  'hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:outline-none',
)
