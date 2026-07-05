import {
  LandingPreview,
  type PreviewDiagnostic,
} from '@workspace/landing-preview'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import {
  Empty,
  EmptyDescription,
  EmptyTitle,
} from '@workspace/ui/components/empty'
import {
  EyeIcon,
  LoaderCircleIcon,
  MaximizeIcon,
  MinimizeIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from 'lucide-react'
import { useState } from 'react'

import { formatCost, formatDuration, formatTokens } from '../lib/format'
import { expandProjectImageUrls } from '../lib/server-api'
import type { RunResult, RunStatus } from '../lib/types'

const PREVIEW_ZOOM_MAX = 3
const PREVIEW_ZOOM_MIN = 0.5
const PREVIEW_ZOOM_STEP = 0.25

export interface ResultCardProps {
  onOpenPreview: (result: RunResult) => void
  onOpenReport: (result: RunResult) => void
  onPreviewDiagnostic: (diagnostic: PreviewDiagnostic) => void
  result: RunResult
}

export function ResultCard({
  onOpenPreview,
  onOpenReport,
  onPreviewDiagnostic,
  result,
}: ResultCardProps) {
  const [zoom, setZoom] = useState(1)
  const durationMs =
    result.stats.durationMs ??
    (result.finishedAt ? result.finishedAt - result.startedAt : undefined)
  const totalTokens = result.stats.usage?.totalTokens
  const html = result.html ? expandProjectImageUrls(result.html) : ''
  const zoomPercent = `${Math.round(zoom * 100)}%`

  return (
    <article className="flex min-h-112 min-w-0 flex-col border bg-card text-card-foreground">
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
          aria-label={`Open run report for ${result.modelLabel}`}
          onClick={() => onOpenReport(result)}
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
        <div className="absolute inset-0 overflow-auto">
          {html ? (
            <div
              className="relative"
              style={{ height: `${zoom * 100}%`, width: `${zoom * 100}%` }}
            >
              <LandingPreview
                html={html}
                iframeClassName="absolute inset-0 size-full border-0 bg-white"
                onPreviewDiagnostic={onPreviewDiagnostic}
              />
            </div>
          ) : (
            <Empty className="absolute inset-0 border-0">
              <EmptyTitle>{emptyTitle(result.status)}</EmptyTitle>
              <EmptyDescription>
                {emptyDescription(result.status)}
              </EmptyDescription>
            </Empty>
          )}
        </div>
        {html ? (
          <div className="absolute top-2 right-2 z-10 flex items-center gap-1 border bg-background/90 p-1 text-xs backdrop-blur">
            <Button
              aria-label="Zoom preview out"
              disabled={zoom <= PREVIEW_ZOOM_MIN}
              onClick={() =>
                setZoom((value) => clampZoom(value - PREVIEW_ZOOM_STEP))
              }
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              <ZoomOutIcon />
            </Button>
            <span className="min-w-9 text-center text-muted-foreground tabular-nums">
              {zoomPercent}
            </span>
            <Button
              aria-label="Zoom preview in"
              disabled={zoom >= PREVIEW_ZOOM_MAX}
              onClick={() =>
                setZoom((value) => clampZoom(value + PREVIEW_ZOOM_STEP))
              }
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              <ZoomInIcon />
            </Button>
            <Button
              aria-label="Reset preview zoom"
              disabled={zoom === 1}
              onClick={() => setZoom(1)}
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              <MinimizeIcon />
            </Button>
            <Button
              aria-label={`Open large preview for ${result.modelLabel}`}
              onClick={() => onOpenPreview(result)}
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              <MaximizeIcon />
            </Button>
          </div>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-3 border-t p-3 text-xs text-muted-foreground">
        <span>{result.editCount} successful edits</span>
        <span>{result.toolCalls.length} tool calls</span>
      </div>
    </article>
  )
}

function clampZoom(value: number): number {
  return Math.min(PREVIEW_ZOOM_MAX, Math.max(PREVIEW_ZOOM_MIN, value))
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
