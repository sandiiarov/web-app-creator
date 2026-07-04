import { Badge } from '@workspace/ui/components/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import { Separator } from '@workspace/ui/components/separator'

import { formatCost, formatDuration, formatTokenUsage } from '../lib/format'
import type { RunResult, RunStatus, ToolCallSummary } from '../lib/types'

export interface RunDetailDialogProps {
  onOpenChange: (open: boolean) => void
  open: boolean
  result: null | RunResult
}

export function RunDetailDialog({
  onOpenChange,
  open,
  result,
}: RunDetailDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="h-[min(90svh,54rem)] w-[92vw] max-w-none overflow-hidden p-0 sm:max-w-none xl:w-[72rem]"
        showCloseButton
      >
        {result ? (
          <div className="grid size-full min-h-0 min-w-0 grid-rows-[auto_auto_minmax(0,1fr)_auto]">
            <DialogHeader className="shrink-0 border-b p-4 pr-12">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={result.status} />
                <DialogTitle>{result.modelLabel}</DialogTitle>
              </div>
              <DialogDescription className="max-w-4xl text-sm/relaxed">
                {result.promptText}
              </DialogDescription>
            </DialogHeader>
            <div className="grid shrink-0 border-b text-xs md:grid-cols-4">
              <Metric
                label="Cost"
                value={
                  typeof result.stats.cost === 'number'
                    ? formatCost(result.stats.cost)
                    : '—'
                }
              />
              <Metric
                label="Duration"
                value={
                  typeof result.stats.durationMs === 'number'
                    ? formatDuration(result.stats.durationMs)
                    : '—'
                }
              />
              <Metric
                label="Tokens"
                value={formatTokenUsage(result.stats.usage) ?? '—'}
              />
              <Metric label="Issues" value={String(result.mistakes.length)} />
            </div>
            <div className="min-h-0 overflow-auto p-4 xl:overflow-hidden">
              <div className="grid min-w-0 gap-4 xl:size-full xl:min-h-0 xl:grid-cols-[minmax(0,1fr)_20rem]">
                <main className="flex min-w-0 flex-col gap-4 xl:min-h-0 xl:overflow-auto xl:pr-1">
                  <Section title="Assistant text">
                    <pre className="max-h-60 min-w-0 overflow-auto border bg-muted/40 p-3 text-xs/relaxed break-words whitespace-pre-wrap">
                      {result.text || 'No assistant text captured yet.'}
                    </pre>
                  </Section>
                  <Section title="Tool calls">
                    {result.toolCalls.length ? (
                      <div className="flex min-w-0 flex-col gap-2">
                        {result.toolCalls.map((call) => (
                          <ToolCallRow call={call} key={call.id} />
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No tool calls captured.
                      </p>
                    )}
                  </Section>
                </main>
                <aside className="flex min-w-0 flex-col gap-4 xl:min-h-0 xl:overflow-auto xl:pr-1">
                  <Section title="Run stats">
                    <dl className="grid grid-cols-2 gap-2 text-xs xl:grid-cols-1">
                      <Stat label="Project" value={result.projectId || '—'} />
                      <Stat label="Model id" value={result.modelId || '—'} />
                      <Stat
                        label="Finish"
                        value={result.stats.finishReason ?? '—'}
                      />
                      <Stat label="Edits" value={String(result.editCount)} />
                      <Stat label="Retries" value={String(result.retryCount)} />
                      <Stat
                        label="Tool calls"
                        value={String(result.toolCalls.length)}
                      />
                    </dl>
                  </Section>
                  <Section title="Mistakes">
                    <div className="flex min-w-0 flex-col gap-2">
                      {result.mistakes.length ? (
                        result.mistakes.map((mistake, index) => (
                          <div
                            className="min-w-0 border p-2 text-xs"
                            key={`${mistake.at}-${index}`}
                          >
                            <div className="mb-1 flex flex-wrap items-center gap-2">
                              <Badge variant="destructive">
                                {mistake.kind}
                              </Badge>
                              {mistake.tool ? (
                                <span className="text-muted-foreground">
                                  {mistake.tool}
                                </span>
                              ) : null}
                            </div>
                            <p className="text-xs/relaxed break-words">
                              {mistake.message}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          No retries, tool errors, or turn errors recorded.
                        </p>
                      )}
                    </div>
                  </Section>
                  {result.error ? (
                    <Section title="Error">
                      <p className="text-xs/relaxed break-words text-destructive">
                        {result.error}
                      </p>
                    </Section>
                  ) : null}
                </aside>
              </div>
            </div>
            <DialogFooter className="shrink-0 border-t p-4" showCloseButton />
          </div>
        ) : (
          <div className="p-4">
            <DialogHeader>
              <DialogTitle>Run details</DialogTitle>
              <DialogDescription>No run selected.</DialogDescription>
            </DialogHeader>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 border-r p-3 last:border-r-0">
      <span className="text-[0.65rem] tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span className="truncate font-medium">{value}</span>
    </div>
  )
}

function Section({
  children,
  title,
}: {
  children: React.ReactNode
  title: string
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center gap-3">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {title}
        </h3>
        <Separator className="min-w-0 flex-1" />
      </div>
      {children}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border p-2">
      <dt className="text-[0.65rem] tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-1 truncate font-medium" title={value}>
        {value}
      </dd>
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
      return <Badge variant="default">Running</Badge>
    case 'stopped':
      return <Badge variant="outline">Stopped</Badge>
  }
}

function ToolCallRow({ call }: { call: ToolCallSummary }) {
  return (
    <article className="grid min-w-0 gap-3 border p-3 md:grid-cols-[10rem_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-wrap items-start gap-2 md:flex-col">
        <Badge className="max-w-full truncate" variant="secondary">
          {call.tool}
        </Badge>
        <Badge variant={call.state === 'error' ? 'destructive' : 'outline'}>
          {call.state}
        </Badge>
      </div>
      <div className="min-w-0">
        {call.intent ? (
          <p className="text-xs/relaxed break-words text-muted-foreground">
            {call.intent}
          </p>
        ) : null}
        {call.result ? (
          <pre className="mt-2 max-h-40 min-w-0 overflow-auto bg-muted/40 p-2 text-xs/relaxed break-words whitespace-pre-wrap">
            {call.result}
          </pre>
        ) : null}
      </div>
    </article>
  )
}
