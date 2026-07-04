/**
 * Benchmark entry point. Runs the read/find/edit task suite across the
 * configured model candidates and prints a per-model comparison.
 *
 * Usage (from repo root):
 *   pnpm --filter @workspace/server bench -- [flags]
 *
 * Flags:
 *   --model <a,b>     Only run these model labels (substring match, CSV).
 *   --task <a,b>      Only run these task ids (substring match, CSV).
 *   --limit <n>       Cap the number of tasks per model.
 *   --steps <n>       Max agent steps per task (default 8).
 *   --tokens <n>      Max output tokens per request (default 4096).
 *   --concurrency <n> Tasks running in parallel across the matrix (default 3).
 *   --list            Print resolved models and tasks, then exit.
 *   --no-json         Skip writing bench-results/<ts>.json.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { runTask, type RunOptions, type TaskOutcome } from './agent-loop.ts'
import { resolveModels } from './models.ts'
import { TASKS } from './tasks.ts'

interface ModelSummary {
  avgLatencyMs: number
  avgSteps: number
  avgToolCalls: number
  editsFailed: number
  editsSucceeded: number
  editSuccessRate: number
  label: string
  passed: number
  passRate: number
  total: number
  totalTokens: number
}

interface ParsedArgs {
  concurrency: number
  list: boolean
  maxOutputTokens?: number
  maxSteps?: number
  modelFilter?: string[]
  noJson: boolean
  taskFilter?: string[]
  taskLimit?: number
}

interface TaskRecord {
  latencyMs: number
  model: string
  outcome: TaskOutcome
  taskId: string
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const { models, skipped } = resolveModels()

  let selectedModels = models
  if (args.modelFilter) {
    selectedModels = models.filter((model) =>
      args.modelFilter!.some((filter) =>
        model.label.toLowerCase().includes(filter.toLowerCase()),
      ),
    )
  }

  let selectedTasks = TASKS
  if (args.taskFilter) {
    selectedTasks = TASKS.filter((task) =>
      args.taskFilter!.some((filter) =>
        task.id.toLowerCase().includes(filter.toLowerCase()),
      ),
    )
  }
  if (args.taskLimit) {
    selectedTasks = selectedTasks.slice(0, args.taskLimit)
  }

  if (args.list) {
    console.log('Resolved models:')
    for (const model of selectedModels) {
      console.log(`  ${model.label}  ${model.provider}/${model.model}`)
    }
    if (skipped.length > 0) {
      console.log('\nSkipped (no API key):')
      for (const reason of skipped) console.log(`  ${reason}`)
    }
    console.log(`\nTasks (${selectedTasks.length}):`)
    for (const task of selectedTasks) {
      console.log(`  ${task.id}  —  ${task.focus}`)
    }
    return
  }

  if (selectedModels.length === 0) {
    console.error(
      'No models to run. Set OPENROUTER_API_KEY, or adjust src/bench/models.ts.',
    )
    if (skipped.length > 0) {
      for (const reason of skipped) console.error(`  skipped: ${reason}`)
    }
    process.exitCode = 1
    return
  }

  const runOptions: RunOptions = {
    maxOutputTokens: args.maxOutputTokens,
    maxSteps: args.maxSteps,
  }

  const work = selectedModels.flatMap((model) =>
    selectedTasks.map((task) => ({ model, task })),
  )

  console.log(
    `Running ${selectedTasks.length} tasks × ${selectedModels.length} models ` +
      `(${work.length} runs, concurrency ${args.concurrency})`,
  )
  for (const model of selectedModels) {
    console.log(`  • ${model.label}  (${model.provider}/${model.model})`)
  }

  const records: TaskRecord[] = await pool(
    work,
    args.concurrency,
    async ({ model, task }) => {
      const startedAt = Date.now()
      const outcome = await runTask(model, task, runOptions)
      const latencyMs = Date.now() - startedAt
      const status = outcome.pass ? 'PASS' : 'FAIL'
      console.log(
        `  [${pad(model.label, 22)}] ${status} ${pad(task.id, 26)} ` +
          `${outcome.reason} (${outcome.steps} steps, ${latencyMs}ms)`,
      )
      return { latencyMs, model: model.label, outcome, taskId: task.id }
    },
  )

  const byModel = new Map<string, TaskRecord[]>()
  for (const record of records) {
    const bucket = byModel.get(record.model) ?? []
    bucket.push(record)
    byModel.set(record.model, bucket)
  }
  const summaries = [...byModel.entries()]
    .map(([label, bucket]) => summarize(label, bucket))
    .sort((a, b) => a.label.localeCompare(b.label))

  printSummaryTable(summaries)

  if (!args.noJson) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const outPath = resolve(process.cwd(), 'bench-results', `${timestamp}.json`)
    await mkdir(dirname(outPath), { recursive: true })
    await writeFile(
      outPath,
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          records,
          summaries,
          tasks: selectedTasks.map((task) => ({
            focus: task.focus,
            id: task.id,
            prompt: task.prompt,
          })),
        },
        null,
        2,
      )}\n`,
    )
    console.log(`\nWrote ${outPath}`)
  }
}

function pad(value: string, width: number, align: 'left' | 'right' = 'left') {
  const text = value.length >= width ? value.slice(0, width) : value
  const gap = ' '.repeat(Math.max(0, width - value.length))
  return align === 'left' ? `${text}${gap}` : `${gap}${text}`
}

function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = { concurrency: 3, list: false, noJson: false }
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index]
    const next = () => argv[++index]
    switch (flag) {
      case '--concurrency':
        result.concurrency = Math.max(1, Number(next()) || 3)
        break
      case '--list':
        result.list = true
        break
      case '--limit':
        result.taskLimit = Math.max(1, Number(next()) || 1)
        break
      case '--model':
        result.modelFilter = splitCsv(next())
        break
      case '--no-json':
        result.noJson = true
        break
      case '--steps':
        result.maxSteps = Math.max(1, Number(next()) || 1)
        break
      case '--task':
        result.taskFilter = splitCsv(next())
        break
      case '--tokens':
        result.maxOutputTokens = Math.max(1, Number(next()) || 1)
        break
      default:
        if (flag?.startsWith('--')) {
          throw new Error(`Unknown flag: ${flag}`)
        }
    }
  }
  return result
}

async function pool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (cursor < items.length) {
        const index = cursor++
        results[index] = await fn(items[index]!)
      }
    },
  )
  await Promise.all(workers)
  return results
}

function printSummaryTable(summaries: ModelSummary[]) {
  if (summaries.length === 0) return
  const headers = [
    'model',
    'pass',
    'edit ok',
    'tools',
    'steps',
    'avg ms',
    'tokens',
  ]
  const ranked = [...summaries].sort((a, b) => b.passRate - a.passRate)
  const rows = ranked.map(summaryRow)
  const widths = headers.map((header, columnIndex) =>
    Math.max(header.length, ...rows.map((row) => row[columnIndex]!.length)),
  )
  const formatRow = (cells: string[]) =>
    cells
      .map((cell, index) =>
        index === 0
          ? pad(cell, widths[index]!, 'left')
          : pad(cell, widths[index]!, 'right'),
      )
      .join('  ')
  console.log()
  console.log('Summary (sorted by pass rate)')
  console.log(`  ${formatRow(headers)}`)
  console.log(`  ${widths.map((width) => '-'.repeat(width)).join('  ')}`)
  for (const row of rows) {
    console.log(`  ${formatRow(row)}`)
  }
}

function splitCsv(value: string | undefined): string[] | undefined {
  if (!value) return undefined
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

function summarize(label: string, records: TaskRecord[]): ModelSummary {
  const total = records.length
  const passed = records.filter((record) => record.outcome.pass).length
  const editsSucceeded = records.reduce(
    (sum, record) => sum + record.outcome.editsSucceeded,
    0,
  )
  const editsFailed = records.reduce(
    (sum, record) => sum + record.outcome.editsFailed,
    0,
  )
  const editsAttempted = editsSucceeded + editsFailed
  const toolCalls = records.reduce(
    (sum, record) =>
      sum +
      record.outcome.toolCalls.read +
      record.outcome.toolCalls.find +
      record.outcome.toolCalls.edit,
    0,
  )
  const latency = records.reduce((sum, record) => sum + record.latencyMs, 0)
  const steps = records.reduce((sum, record) => sum + record.outcome.steps, 0)
  const tokens = records.reduce(
    (sum, record) => sum + (record.outcome.usage?.totalTokens ?? 0),
    0,
  )
  return {
    avgLatencyMs: total ? Math.round(latency / total) : 0,
    avgSteps: total ? +(steps / total).toFixed(1) : 0,
    avgToolCalls: total ? +(toolCalls / total).toFixed(1) : 0,
    editsFailed,
    editsSucceeded,
    editSuccessRate: editsAttempted
      ? +(editsSucceeded / editsAttempted).toFixed(2)
      : 0,
    label,
    passed,
    passRate: total ? +(passed / total).toFixed(2) : 0,
    total,
    totalTokens: tokens,
  }
}

function summaryRow(summary: ModelSummary): string[] {
  return [
    summary.label,
    `${summary.passed}/${summary.total} (${summary.passRate})`,
    `${summary.editSuccessRate}`,
    `${summary.avgToolCalls}`,
    `${summary.avgSteps}`,
    `${summary.avgLatencyMs}`,
    `${summary.totalTokens}`,
  ]
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error)
  process.exitCode = 1
})
