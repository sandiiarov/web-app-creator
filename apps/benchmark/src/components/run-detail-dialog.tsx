import { Badge } from '@workspace/ui/components/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import { ScrollArea } from '@workspace/ui/components/scroll-area'
import { Separator } from '@workspace/ui/components/separator'

import { formatCost, formatDuration, formatTokenUsage } from '../lib/format'
import type { RunResult } from '../lib/types'

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
      <DialogContent className="max-h-[90svh] max-w-4xl p-0" showCloseButton>
        {result ? (
          <div className="flex max-h-[90svh] min-h-0 flex-col">
            <DialogHeader className="border-b p-4 pr-12">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{result.status}</Badge>
                <DialogTitle>{result.modelLabel}</DialogTitle>
              </div>
              <DialogDescription>{result.promptText}</DialogDescription>
            </DialogHeader>
            <ScrollArea className="min-h-0 flex-1">
              <div className="grid gap-4 p-4 lg:grid-cols-[1fr_18rem]">
                <main className="flex min-w-0 flex-col gap-4">
                  <Section title="Assistant text">
                    <pre className="max-h-60 overflow-auto border bg-muted/40 p-3 text-xs/relaxed whitespace-pre-wrap">
                      {result.text || 'No assistant text captured yet.'}
                    </pre>
                  </Section>
                  <Section title="Tool calls">
                    <div className="flex flex-col gap-2">
                      {result.toolCalls.length ? (
                        result.toolCalls.map((call) => (
                          <div className="border p-3" key={call.id}>
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <Badge variant="secondary">{call.tool}</Badge>
                              <Badge
                                variant={
                                  call.state === 'error'
                                    ? 'destructive'
                                    : 'outline'
                                }
                              >
                                {call.state}
                              </Badge>
                            </div>
                            {call.intent ? (
                              <p className="text-xs/relaxed text-muted-foreground">
                                {call.intent}
                              </p>
                            ) : null}
                            {call.result ? (
                              <pre className="mt-2 max-h-36 overflow-auto bg-muted/40 p-2 text-xs/relaxed whitespace-pre-wrap">
                                {call.result}
                              </pre>
                            ) : null}
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          No tool calls captured.
                        </p>
                      )}
                    </div>
                  </Section>
                </main>
                <aside className="flex min-w-0 flex-col gap-4">
                  <Section title="Run stats">
                    <dl className="grid grid-cols-2 gap-2 text-xs">
                      <Stat label="Project" value={result.projectId || '—'} />
                      <Stat label="Model id" value={result.modelId || '—'} />
                      <Stat
                        label="Cost"
                        value={
                          typeof result.stats.cost === 'number'
                            ? formatCost(result.stats.cost)
                            : '—'
                        }
                      />
                      <Stat
                        label="Duration"
                        value={
                          typeof result.stats.durationMs === 'number'
                            ? formatDuration(result.stats.durationMs)
                            : '—'
                        }
                      />
                      <Stat
                        label="Tokens"
                        value={formatTokenUsage(result.stats.usage) ?? '—'}
                      />
                      <Stat
                        label="Finish"
                        value={result.stats.finishReason ?? '—'}
                      />
                      <Stat label="Edits" value={String(result.editCount)} />
                      <Stat label="Retries" value={String(result.retryCount)} />
                    </dl>
                  </Section>
                  <Section title="Mistakes">
                    <div className="flex flex-col gap-2">
                      {result.mistakes.length ? (
                        result.mistakes.map((mistake, index) => (
                          <div
                            className="border p-2 text-xs"
                            key={`${mistake.at}-${index}`}
                          >
                            <div className="mb-1 flex items-center gap-2">
                              <Badge variant="destructive">
                                {mistake.kind}
                              </Badge>
                              {mistake.tool ? (
                                <span className="text-muted-foreground">
                                  {mistake.tool}
                                </span>
                              ) : null}
                            </div>
                            <p className="text-xs/relaxed">{mistake.message}</p>
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
                      <p className="text-xs/relaxed text-destructive">
                        {result.error}
                      </p>
                    </Section>
                  ) : null}
                </aside>
              </div>
            </ScrollArea>
            <DialogFooter className="border-t p-4" showCloseButton />
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
        <Separator className="flex-1" />
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
