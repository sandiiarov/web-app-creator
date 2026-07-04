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

interface ModelAggregate {
  averageCost: number
  averageDurationMs: number
  averageMistakes: number
  averageToolCalls: number
  doneRuns: number
  errorRuns: number
  modelId: string
  modelLabel: string
  runs: number
  score: number
}

export function ReportView({ results }: ReportViewProps) {
  const aggregates = aggregateByModel(results)
  const completed = results.filter((result) =>
    ['done', 'error', 'stopped'].includes(result.status),
  ).length

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
            Model ranking across {results.length} runs. Lower mistakes and
            faster successful runs score higher.
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
        <table className="w-full min-w-[42rem] border-collapse text-left text-xs">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              <Th>Rank</Th>
              <Th>Model</Th>
              <Th>Score</Th>
              <Th>Done</Th>
              <Th>Errors</Th>
              <Th>Avg mistakes</Th>
              <Th>Avg time</Th>
              <Th>Avg cost</Th>
              <Th>Tool calls</Th>
            </tr>
          </thead>
          <tbody>
            {aggregates.map((aggregate, index) => (
              <tr className="border-t" key={aggregate.modelId}>
                <Td>#{index + 1}</Td>
                <Td>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-medium">{aggregate.modelLabel}</span>
                    <span className="truncate text-muted-foreground">
                      {aggregate.modelId}
                    </span>
                  </div>
                </Td>
                <Td>{aggregate.score.toFixed(0)}</Td>
                <Td>
                  {aggregate.doneRuns}/{aggregate.runs}
                </Td>
                <Td>{aggregate.errorRuns}</Td>
                <Td>{aggregate.averageMistakes.toFixed(1)}</Td>
                <Td>{formatDuration(aggregate.averageDurationMs)}</Td>
                <Td>{formatCost(aggregate.averageCost)}</Td>
                <Td>{aggregate.averageToolCalls.toFixed(1)}</Td>
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
      const doneRuns = modelRuns.filter((run) => run.status === 'done').length
      const errorRuns = modelRuns.filter((run) => run.status === 'error').length
      const averageMistakes = average(
        modelRuns.map((run) => run.mistakes.length + run.retryCount),
      )
      const averageToolCalls = average(
        modelRuns.map((run) => run.toolCalls.length),
      )
      const averageCost = average(
        modelRuns.map((run) => run.stats.cost).filter(isNumber),
      )
      const averageDurationMs = average(
        modelRuns
          .map((run) => run.stats.durationMs ?? durationFromRun(run))
          .filter(isNumber),
      )
      const score = Math.max(
        0,
        doneRuns * 35 -
          errorRuns * 20 -
          averageMistakes * 10 -
          averageDurationMs / 1500 -
          averageCost * 30,
      )
      return {
        averageCost,
        averageDurationMs,
        averageMistakes,
        averageToolCalls,
        doneRuns,
        errorRuns,
        modelId,
        modelLabel: modelRuns[0]?.modelLabel ?? modelId,
        runs: modelRuns.length,
        score,
      }
    })
    .sort((a, b) => b.score - a.score)
}

function average(values: number[]): number {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function durationFromRun(run: RunResult): number | undefined {
  return run.finishedAt ? run.finishedAt - run.startedAt : undefined
}

function isNumber(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 align-top">{children}</td>
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 font-medium">{children}</th>
}
