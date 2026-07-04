import {
  SERVER_URL,
  type BenchmarkModel,
  type BenchmarkPrompt,
  type BenchmarkReport,
  type BenchmarkReportAggregate,
  type BenchmarkReportRun,
  type BenchmarkReportSummary,
  type BenchmarkUserFeedback,
  type RunResult,
  type RunStatus,
} from './types'

export const BENCHMARK_REPORT_VERSION = '1'

export interface BuildBenchmarkReportInput {
  concurrency: number
  models: BenchmarkModel[]
  prompts: BenchmarkPrompt[]
  results: RunResult[]
  userFeedback: BenchmarkUserFeedback
}

export function buildBenchmarkReport({
  concurrency,
  models,
  prompts,
  results,
  userFeedback,
}: BuildBenchmarkReportInput): BenchmarkReport {
  const runs = results.map(toReportRun)

  return {
    aggregates: aggregateRuns(runs),
    app: 'benchmark',
    generatedAt: new Date().toISOString(),
    reportVersion: BENCHMARK_REPORT_VERSION,
    runConfig: {
      concurrency,
      models,
      prompts,
      screenshotCapture: 'disabled-fast-error',
    },
    runs,
    serverUrl: SERVER_URL,
    summary: summarizeRuns(runs, prompts.length, models.length),
    userFeedback,
  }
}

export function createReportHandoffPrompt(
  reportPath: string,
  report: BenchmarkReport,
): string {
  return [
    `Check the benchmark report JSON at ${JSON.stringify(reportPath)}.`,
    'Read that file first, then identify the highest-impact problems across tool behavior, cost, model choice, generated output, reliability, and the recorded user feedback.',
    `The report contains ${report.summary.runCount} runs across ${report.summary.modelCount} model(s) and ${report.summary.promptCount} prompt(s).`,
    'Use concrete evidence from the report — model ids, prompts, tool calls, costs, errors, retries, output HTML, and user notes — then make the necessary code or configuration adjustments.',
  ].join(' ')
}

function aggregateRuns(runs: BenchmarkReportRun[]): BenchmarkReportAggregate[] {
  const byModel = new Map<string, BenchmarkReportRun[]>()

  for (const run of runs) {
    const current = byModel.get(run.modelId) ?? []
    current.push(run)
    byModel.set(run.modelId, current)
  }

  return Array.from(byModel.entries())
    .map(([modelId, modelRuns]) => {
      const terminalRuns = modelRuns.filter((run) => isTerminal(run.status))
      const durations = terminalRuns
        .map((run) => run.durationMs)
        .filter(isFiniteNumber)
      const totalCost = sum(modelRuns.map((run) => run.stats.cost))
      const totalMistakes = sum(modelRuns.map((run) => run.mistakes.length))

      return {
        averageCost: optionalAverage(terminalRuns.map((run) => run.stats.cost)),
        averageDurationMs: optionalAverage(durations),
        averageMistakes: terminalRuns.length
          ? totalMistakes / terminalRuns.length
          : 0,
        doneRuns: modelRuns.filter((run) => run.status === 'done').length,
        errorRuns: modelRuns.filter((run) => run.status === 'error').length,
        modelId,
        modelLabel: modelRuns[0]?.modelLabel ?? modelId,
        stoppedRuns: modelRuns.filter((run) => run.status === 'stopped').length,
        totalCost,
        totalEdits: sum(modelRuns.map((run) => run.editCount)),
        totalMistakes,
        totalRetries: sum(modelRuns.map((run) => run.retryCount)),
        totalRuns: modelRuns.length,
        totalToolCalls: sum(modelRuns.map((run) => run.toolCalls.length)),
      }
    })
    .sort((a, b) => a.modelLabel.localeCompare(b.modelLabel))
}

function durationMs(result: RunResult): number | undefined {
  if (typeof result.stats.durationMs === 'number')
    return result.stats.durationMs

  return typeof result.finishedAt === 'number' &&
    Number.isFinite(result.finishedAt)
    ? result.finishedAt - result.startedAt
    : undefined
}

function isFiniteNumber(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isTerminal(status: RunStatus): boolean {
  return status === 'done' || status === 'error' || status === 'stopped'
}

function optionalAverage(
  values: Array<number | undefined>,
): number | undefined {
  const finite = values.filter(isFiniteNumber)
  return finite.length ? sum(finite) / finite.length : undefined
}

function sum(values: Array<number | undefined>): number {
  return values
    .filter(isFiniteNumber)
    .reduce((total, value) => total + value, 0)
}

function summarizeRuns(
  runs: BenchmarkReportRun[],
  promptCount: number,
  modelCount: number,
): BenchmarkReportSummary {
  const terminalRuns = runs.filter((run) => isTerminal(run.status))
  const startedAt = Math.min(...runs.map((run) => Date.parse(run.startedAt)))
  const finishedDates = runs
    .map((run) => (run.finishedAt ? Date.parse(run.finishedAt) : undefined))
    .filter(isFiniteNumber)

  return {
    averageDurationMs: optionalAverage(
      terminalRuns.map((run) => run.durationMs),
    ),
    completedRuns: terminalRuns.length,
    doneRuns: runs.filter((run) => run.status === 'done').length,
    errorRuns: runs.filter((run) => run.status === 'error').length,
    finishedAt: finishedDates.length
      ? new Date(Math.max(...finishedDates)).toISOString()
      : undefined,
    modelCount,
    promptCount,
    runCount: runs.length,
    startedAt: Number.isFinite(startedAt)
      ? new Date(startedAt).toISOString()
      : undefined,
    stoppedRuns: runs.filter((run) => run.status === 'stopped').length,
    totalCost: sum(runs.map((run) => run.stats.cost)),
    totalEdits: sum(runs.map((run) => run.editCount)),
    totalMistakes: sum(runs.map((run) => run.mistakes.length)),
    totalRetries: sum(runs.map((run) => run.retryCount)),
    totalToolCalls: sum(runs.map((run) => run.toolCalls.length)),
  }
}

function toIso(timestamp: number): string {
  return new Date(timestamp).toISOString()
}

function toReportRun(result: RunResult): BenchmarkReportRun {
  return {
    durationMs: durationMs(result),
    editCount: result.editCount,
    error: result.error,
    finishedAt: result.finishedAt ? toIso(result.finishedAt) : undefined,
    html: result.html,
    htmlBytes: new TextEncoder().encode(result.html).length,
    id: result.id,
    mistakes: result.mistakes,
    modelId: result.modelId,
    modelLabel: result.modelLabel,
    projectId: result.projectId,
    promptId: result.promptId,
    promptText: result.promptText,
    retryCount: result.retryCount,
    startedAt: toIso(result.startedAt),
    stats: result.stats,
    status: result.status,
    text: result.text,
    toolCalls: result.toolCalls,
  }
}
