import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Textarea } from '@workspace/ui/components/textarea'
import {
  CheckIcon,
  ClipboardIcon,
  SaveIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import { buildBenchmarkReport, createReportHandoffPrompt } from '../lib/report'
import {
  saveBenchmarkReport,
  type SavedBenchmarkReport,
} from '../lib/server-api'
import type {
  BenchmarkModel,
  BenchmarkPrompt,
  BenchmarkUserFeedback,
  FeedbackProblemArea,
  FeedbackRating,
  RunResult,
} from '../lib/types'

const DEFAULT_FEEDBACK: BenchmarkUserFeedback = {
  notes: '',
  problemAreas: [],
  rating: 'needs-work',
  requestedAdjustment: '',
}

const PROBLEM_AREAS: Array<{ id: FeedbackProblemArea; label: string }> = [
  { id: 'tool_behavior', label: 'Tool behavior' },
  { id: 'cost', label: 'Cost' },
  { id: 'visual_output', label: 'Visual output' },
  { id: 'reliability', label: 'Reliability' },
  { id: 'model_choice', label: 'Model choice' },
  { id: 'prompts', label: 'Prompts' },
]

interface ReportSavePanelProps {
  concurrency: number
  isRunning: boolean
  models: BenchmarkModel[]
  prompts: BenchmarkPrompt[]
  results: RunResult[]
}

type SaveState =
  | {
      copied: boolean
      handoffPrompt: string
      report: SavedBenchmarkReport
      status: 'success'
    }
  | { error: string; status: 'error' }
  | { status: 'idle' }
  | { status: 'saving' }

export function ReportSavePanel({
  concurrency,
  isRunning,
  models,
  prompts,
  results,
}: ReportSavePanelProps) {
  const [feedback, setFeedback] = useState(DEFAULT_FEEDBACK)
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' })
  const canSave =
    results.length > 0 && !isRunning && saveState.status !== 'saving'
  const reportPreview = useMemo(
    () =>
      buildBenchmarkReport({
        concurrency,
        models,
        prompts,
        results,
        userFeedback: feedback,
      }),
    [concurrency, feedback, models, prompts, results],
  )

  async function handleCopy(prompt: string) {
    const copied = await copyToClipboard(prompt)
    setSaveState((current) =>
      current.status === 'success' ? { ...current, copied } : current,
    )
  }

  async function handleSave() {
    if (!canSave) return
    setSaveState({ status: 'saving' })

    try {
      const report = buildBenchmarkReport({
        concurrency,
        models,
        prompts,
        results,
        userFeedback: feedback,
      })
      const saved = await saveBenchmarkReport(report)
      const handoffPrompt = createReportHandoffPrompt(saved.path, report)
      const copied = await copyToClipboard(handoffPrompt)
      setSaveState({ copied, handoffPrompt, report: saved, status: 'success' })
    } catch (error) {
      setSaveState({
        error: error instanceof Error ? error.message : String(error),
        status: 'error',
      })
    }
  }

  return (
    <section className="grid gap-4 border bg-card p-4 text-card-foreground xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="font-heading text-base font-semibold">
              Agent improvement handoff
            </h2>
            <p className="max-w-3xl text-xs/relaxed text-muted-foreground">
              Save the current benchmark as local JSON, attach your judgment,
              and copy a ready-to-send prompt for a coding agent to inspect the
              report and make adjustments.
            </p>
          </div>
          <Badge variant={results.length ? 'secondary' : 'outline'}>
            {results.length} runs in report
          </Badge>
        </div>

        <div className="grid gap-3 md:grid-cols-[12rem_minmax(0,1fr)]">
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Overall read
            </span>
            <select
              className="min-h-9 border bg-background px-2 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isRunning || saveState.status === 'saving'}
              onChange={(event) =>
                setFeedback((current) => ({
                  ...current,
                  rating: event.target.value as FeedbackRating,
                }))
              }
              value={feedback.rating}
            >
              <option value="useful">Useful baseline</option>
              <option value="needs-work">Needs work</option>
              <option value="failed">Failed benchmark</option>
            </select>
          </label>
          <fieldset className="min-w-0">
            <legend className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Problem areas
            </legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {PROBLEM_AREAS.map((area) => (
                <label
                  className="flex min-h-9 cursor-pointer items-center gap-2 border px-2 py-1.5 text-xs transition-colors hover:bg-muted has-disabled:cursor-not-allowed has-disabled:opacity-50"
                  key={area.id}
                >
                  <input
                    checked={feedback.problemAreas.includes(area.id)}
                    className="accent-primary"
                    disabled={isRunning || saveState.status === 'saving'}
                    onChange={() => toggleProblemArea(area.id)}
                    type="checkbox"
                  />
                  <span>{area.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              User feedback
            </span>
            <Textarea
              className="min-h-28 resize-y"
              disabled={isRunning || saveState.status === 'saving'}
              onChange={(event) =>
                setFeedback((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              placeholder="What looked wrong, expensive, brittle, or promising?"
              value={feedback.notes}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Requested adjustment
            </span>
            <Textarea
              className="min-h-28 resize-y"
              disabled={isRunning || saveState.status === 'saving'}
              onChange={(event) =>
                setFeedback((current) => ({
                  ...current,
                  requestedAdjustment: event.target.value,
                }))
              }
              placeholder="What should the next coding agent change first?"
              value={feedback.requestedAdjustment}
            />
          </label>
        </div>
      </div>

      <aside className="flex min-w-0 flex-col gap-3 border bg-muted/25 p-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Metric label="Runs" value={String(reportPreview.summary.runCount)} />
          <Metric
            label="Tool calls"
            value={String(reportPreview.summary.totalToolCalls)}
          />
          <Metric
            label="Mistakes"
            value={String(reportPreview.summary.totalMistakes)}
          />
          <Metric
            label="Retries"
            value={String(reportPreview.summary.totalRetries)}
          />
        </div>

        <Button
          disabled={!canSave}
          onClick={handleSave}
          type="button"
          variant="default"
        >
          <SaveIcon data-icon="inline-start" />
          {saveState.status === 'saving' ? 'Saving report…' : 'Save report'}
        </Button>
        <p className="text-xs/relaxed text-muted-foreground">
          {saveHint(isRunning, results.length, saveState.status)}
        </p>

        {saveState.status === 'success' ? (
          <div className="flex min-w-0 flex-col gap-2 border bg-background p-3 text-xs">
            <div className="flex items-center gap-2 font-medium">
              <CheckIcon data-icon="inline-start" />
              {saveState.copied
                ? 'Saved and copied agent prompt'
                : 'Saved; copy prompt manually'}
            </div>
            <code className="block min-w-0 overflow-x-auto whitespace-nowrap text-muted-foreground">
              {saveState.report.path}
            </code>
            <Textarea
              aria-label="Copied agent prompt"
              className="min-h-24 resize-y text-xs"
              readOnly
              value={saveState.handoffPrompt}
            />
            <Button
              onClick={() => void handleCopy(saveState.handoffPrompt)}
              size="sm"
              type="button"
              variant="outline"
            >
              <ClipboardIcon data-icon="inline-start" />
              Copy prompt
            </Button>
          </div>
        ) : null}

        {saveState.status === 'error' ? (
          <div className="flex gap-2 border border-destructive/40 bg-destructive/10 p-3 text-xs/relaxed text-destructive">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
            <span>{saveState.error}</span>
          </div>
        ) : null}
      </aside>
    </section>
  )

  function toggleProblemArea(area: FeedbackProblemArea) {
    setFeedback((current) => ({
      ...current,
      problemAreas: current.problemAreas.includes(area)
        ? current.problemAreas.filter((entry) => entry !== area)
        : [...current.problemAreas, area],
    }))
  }
}

async function copyToClipboard(value: string): Promise<boolean> {
  if (!navigator.clipboard) return false

  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 border bg-background p-2">
      <span className="text-[0.65rem] tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span className="truncate font-medium">{value}</span>
    </div>
  )
}

function saveHint(
  isRunning: boolean,
  resultCount: number,
  status: SaveState['status'],
): string {
  if (status === 'saving') return 'Writing JSON to the server…'
  if (isRunning) return 'Stop or finish the benchmark before saving a report.'
  if (!resultCount) return 'Run a benchmark before saving a report.'
  return 'Saves JSON on the server and copies the next-agent prompt.'
}
