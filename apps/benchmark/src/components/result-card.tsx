import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import {
  Empty,
  EmptyDescription,
  EmptyTitle,
} from '@workspace/ui/components/empty'
import { EyeIcon, LoaderCircleIcon } from 'lucide-react'

import { formatCost, formatDuration, formatTokens } from '../lib/format'
import { expandProjectImageUrls } from '../lib/server-api'
import type { RunResult, RunStatus } from '../lib/types'

export interface ResultCardProps {
  onOpenDetail: (result: RunResult) => void
  result: RunResult
}

export function ResultCard({ onOpenDetail, result }: ResultCardProps) {
  const durationMs =
    result.stats.durationMs ??
    (result.finishedAt ? result.finishedAt - result.startedAt : undefined)
  const totalTokens = result.stats.usage?.totalTokens
  const html = result.html ? expandProjectImageUrls(result.html) : ''

  return (
    <article className="flex min-h-[28rem] min-w-0 flex-col border bg-card text-card-foreground">
      <div className="flex items-start justify-between gap-3 border-b p-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusBadge status={result.status} />
            <span className="truncate text-xs font-medium">
              {result.modelLabel || result.modelId || 'Queued model'}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs/relaxed text-muted-foreground">
            {result.promptText}
          </p>
        </div>
        <Button
          aria-label={`Open details for ${result.modelLabel}`}
          onClick={() => onOpenDetail(result)}
          size="icon-sm"
          type="button"
          variant="outline"
        >
          <EyeIcon />
        </Button>
      </div>
      <div className="grid grid-cols-4 border-b text-xs">
        <Metric
          label="Cost"
          value={
            typeof result.stats.cost === 'number'
              ? formatCost(result.stats.cost)
              : '—'
          }
        />
        <Metric
          label="Time"
          value={
            typeof durationMs === 'number' ? formatDuration(durationMs) : '—'
          }
        />
        <Metric label="Tokens" value={formatTokens(totalTokens)} />
        <Metric label="Issues" value={String(result.mistakes.length)} />
      </div>
      <div className="relative min-h-0 flex-1 bg-muted/30">
        {html ? (
          <iframe
            className="absolute inset-0 size-full border-0 bg-white"
            sandbox="allow-same-origin"
            srcDoc={html}
            title={`${result.modelLabel} benchmark preview`}
          />
        ) : (
          <Empty className="absolute inset-0 border-0">
            <EmptyTitle>{emptyTitle(result.status)}</EmptyTitle>
            <EmptyDescription>
              {emptyDescription(result.status)}
            </EmptyDescription>
          </Empty>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 border-t p-3 text-xs text-muted-foreground">
        <span>{result.editCount} successful edits</span>
        <span>{result.toolCalls.length} tool calls</span>
      </div>
    </article>
  )
}

function emptyDescription(status: RunStatus): string {
  switch (status) {
    case 'done':
      return 'The run finished without streaming an HTML update.'
    case 'error':
      return 'Open the details to inspect the failure and tool events.'
    case 'pending':
      return 'Waiting for its turn in the concurrency pool.'
    case 'running':
      return 'The first successful edit will render here.'
    case 'stopped':
      return 'The benchmark was stopped before this run produced HTML.'
  }
}

function emptyTitle(status: RunStatus): string {
  switch (status) {
    case 'done':
      return 'No preview captured'
    case 'error':
      return 'Run failed'
    case 'pending':
      return 'Queued'
    case 'running':
      return 'Streaming agent output'
    case 'stopped':
      return 'Stopped'
  }
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 border-r p-2 last:border-r-0">
      <span className="text-[0.65rem] tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span className="truncate font-medium">{value}</span>
    </div>
  )
}

function StatusBadge({ status }: { status: RunStatus }) {
  switch (status) {
    case 'done':
      return <Badge variant="secondary">Done</Badge>
    case 'error':
      return <Badge variant="destructive">Error</Badge>
    case 'pending':
      return <Badge variant="outline">Queued</Badge>
    case 'running':
      return (
        <Badge variant="default">
          <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
          Running
        </Badge>
      )
    case 'stopped':
      return <Badge variant="outline">Stopped</Badge>
  }
}
