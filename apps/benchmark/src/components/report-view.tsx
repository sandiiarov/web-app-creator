import { Badge } from '@workspace/ui/components/badge'
import {
  Empty,
  EmptyDescription,
  EmptyTitle,
} from '@workspace/ui/components/empty'

import { formatCost, formatDuration } from '../lib/format'
import type { RunResult } from '../lib/types'

export interface ReportViewProps {
  results: RunResult[]
}

type AggregateState = 'complete' | 'queued' | 'running' | 'stopped'

interface ModelAggregate {
  averageCost?: number
  averageDurationMs?: number
  averageMistakes?: number
  doneRuns: number
  errorRuns: number
  finishedRuns: number
  modelId: string
  modelLabel: string
  runs: number
  score?: number
  state: AggregateState
  toolCalls: number
}

export function ReportView({ results }: ReportViewProps) {
  const aggregates = aggregateByModel(results)
  const completed = results.filter(isTerminalStatus).length

  if (!results.length) {
    return (
      <Empty className="min-h-64 border">
        <EmptyTitle>No benchmark runs yet</EmptyTitle>
        <EmptyDescription>
          Select prompts and text models, then start the benchmark. Results will
          rank models by completion, mistakes, latency, and cost.
        </EmptyDescription>
      </Empty>
    )
  }

  return (
    <section className="flex flex-col gap-3 border bg-card p-4 text-card-foreground">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-base font-semibold">Report</h2>
          <p className="text-xs/relaxed text-muted-foreground">
            Live rows show run state first. Score and averages appear only after
            a model has finished at least one run.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">
            {completed}/{results.length} finished
          </Badge>
          <Badge variant="secondary">{aggregates.length} models</Badge>
        </div>
      </div>
      <div className="overflow-x-auto border">
        <table className="w-full min-w-[46rem] border-collapse text-left text-xs">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              <Th>Rank</Th>
              <Th>Model</Th>
              <Th>State</Th>
              <Th>Score</Th>
              <Th>Done</Th>
              <Th>Errors</Th>
              <Th>Avg issues</Th>
              <Th>Avg time</Th>
              <Th>Avg cost</Th>
              <Th>Tool calls</Th>
            </tr>
          </thead>
          <tbody>
            {aggregates.map((aggregate, index) => (
              <tr className="border-t" key={aggregate.modelId}>
                <Td>{aggregate.score === undefined ? '—' : `#${index + 1}`}</Td>
                <Td>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-medium">{aggregate.modelLabel}</span>
                    <span className="truncate text-muted-foreground">
                      {aggregate.modelId}
                    </span>
                  </div>
                </Td>
                <Td>
                  <AggregateStateBadge state={aggregate.state} />
                </Td>
                <Td>{formatOptionalNumber(aggregate.score, 0)}</Td>
                <Td>
                  {aggregate.doneRuns}/{aggregate.runs}
                </Td>
                <Td>{aggregate.errorRuns}</Td>
                <Td>{formatOptionalNumber(aggregate.averageMistakes, 1)}</Td>
                <Td>{formatOptionalDuration(aggregate.averageDurationMs)}</Td>
                <Td>{formatOptionalCost(aggregate.averageCost)}</Td>
                <Td>{aggregate.toolCalls}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function aggregateByModel(results: RunResult[]): ModelAggregate[] {
  const byModel = new Map<string, RunResult[]>()
  for (const result of results) {
    const existing = byModel.get(result.modelId) ?? []
    existing.push(result)
    byModel.set(result.modelId, existing)
  }

  return Array.from(byModel.entries())
    .map(([modelId, modelRuns]) => {
      const terminalRuns = modelRuns.filter(isTerminalStatus)
      const doneRuns = modelRuns.filter((run) => run.status === 'done').length
      const errorRuns = modelRuns.filter((run) => run.status === 'error').length
      const averageMistakes = optionalAverage(
        terminalRuns.map((run) => run.mistakes.length + run.retryCount),
      )
      const averageCost = optionalAverage(
        terminalRuns.map((run) => run.stats.cost).filter(isNumber),
      )
      const averageDurationMs = optionalAverage(
        terminalRuns
          .map((run) => run.stats.durationMs ?? durationFromRun(run))
          .filter(isNumber),
      )
      const score =
        terminalRuns.length &&
        averageMistakes !== undefined &&
        averageDurationMs !== undefined &&
        averageCost !== undefined
          ? Math.max(
              0,
              doneRuns * 35 -
                errorRuns * 20 -
                averageMistakes * 10 -
                averageDurationMs / 1500 -
                averageCost * 30,
            )
          : undefined
      return {
        averageCost,
        averageDurationMs,
        averageMistakes,
        doneRuns,
        errorRuns,
        finishedRuns: terminalRuns.length,
        modelId,
        modelLabel: modelRuns[0]?.modelLabel ?? modelId,
        runs: modelRuns.length,
        score,
        state: aggregateState(modelRuns),
        toolCalls: modelRuns.reduce(
          (count, run) => count + run.toolCalls.length,
          0,
        ),
      }
    })
    .sort((a, b) => {
      if (a.score === undefined && b.score === undefined) {
        return a.modelLabel.localeCompare(b.modelLabel)
      }
      if (a.score === undefined) return 1
      if (b.score === undefined) return -1
      return b.score - a.score
    })
}

function aggregateState(runs: RunResult[]): AggregateState {
  if (runs.some((run) => run.status === 'running')) return 'running'
  if (runs.every((run) => run.status === 'pending')) return 'queued'
  if (runs.every((run) => run.status === 'stopped')) return 'stopped'
  return 'complete'
}

function AggregateStateBadge({ state }: { state: AggregateState }) {
  switch (state) {
    case 'complete':
      return <Badge variant="secondary">Complete</Badge>
    case 'queued':
      return <Badge variant="outline">Queued</Badge>
    case 'running':
      return <Badge variant="default">Running</Badge>
    case 'stopped':
      return <Badge variant="outline">Stopped</Badge>
  }
}

function durationFromRun(run: RunResult): number | undefined {
  return run.finishedAt ? run.finishedAt - run.startedAt : undefined
}

function formatOptionalCost(value: number | undefined): string {
  return typeof value === 'number' ? formatCost(value) : '—'
}

function formatOptionalDuration(value: number | undefined): string {
  return typeof value === 'number' ? formatDuration(value) : '—'
}

function formatOptionalNumber(
  value: number | undefined,
  fractionDigits: number,
): string {
  return typeof value === 'number' ? value.toFixed(fractionDigits) : '—'
}

function isNumber(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isTerminalStatus(result: RunResult): boolean {
  return ['done', 'error', 'stopped'].includes(result.status)
}

function optionalAverage(values: number[]): number | undefined {
  if (!values.length) return undefined
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 align-top">{children}</td>
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 font-medium">{children}</th>
}
