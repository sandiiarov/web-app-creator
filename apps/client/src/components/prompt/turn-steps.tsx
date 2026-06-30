import {
  Marker,
  MarkerContent,
  MarkerIcon,
} from '@workspace/ui/components/marker'
import { cn } from '@workspace/ui/lib/utils'
import { Check, CircleAlert, LoaderCircle } from 'lucide-react'

import type { ToolCallPart, ToolCallState } from '../../lib/landing-agent'

const TOOL_LABELS: Record<string, string> = {
  edit: 'Edit',
  generate_image: 'Generate image',
  grep: 'Search',
  read: 'Read',
  scrape: 'Scrape',
  skill: 'Skill',
  skill_read: 'Skill reference',
  skill_search: 'Skill search',
}

export function TurnSteps({ steps }: { steps: ToolCallPart[] }) {
  if (steps.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col gap-1 rounded-none border border-border/60 bg-background/50 p-2">
      {steps.map((step) => (
        <StepRow key={step.id} step={step} />
      ))}
    </div>
  )
}

function labelForStep(step: ToolCallPart) {
  return TOOL_LABELS[step.tool] ?? step.tool
}

function StepIcon({ state }: { state: ToolCallState }) {
  if (state === 'done') {
    return <Check className="size-3.5" />
  }

  if (state === 'error') {
    return <CircleAlert className="size-3.5" />
  }

  if (state === 'running' || state === 'start') {
    return <LoaderCircle className="size-3.5 animate-spin" />
  }

  return (
    <span className="inline-block size-1.5 shrink-0 rounded-none bg-muted-foreground/50" />
  )
}

function StepRow({ step }: { step: ToolCallPart }) {
  const label = labelForStep(step)
  const detail = step.detail ?? step.intent
  const result = step.result

  return (
    <Marker
      className={cn(
        'items-start gap-2 py-1',
        step.state === 'error' && 'text-destructive',
      )}
    >
      <MarkerIcon className="mt-0.5">
        <StepIcon state={step.state} />
      </MarkerIcon>
      <MarkerContent className="flex flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-medium text-foreground">{label}</span>
        </span>
        {detail ? <ToolText>{detail}</ToolText> : null}
        {result ? (
          <ToolText className="border-l border-border/70 pl-2 text-foreground/85">
            {result}
          </ToolText>
        ) : null}
      </MarkerContent>
    </Marker>
  )
}

function ToolText({
  children,
  className,
}: {
  children: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'text-[11px] leading-relaxed wrap-break-word whitespace-pre-wrap text-muted-foreground',
        className,
      )}
    >
      {children}
    </span>
  )
}
