import { LANDING_MODEL_OPTIONS } from '@workspace/prompt-panel'
import { Badge } from '@workspace/ui/components/badge'
import {
  Empty,
  EmptyDescription,
  EmptyTitle,
} from '@workspace/ui/components/empty'
import { Separator } from '@workspace/ui/components/separator'
import { useMemo, useState } from 'react'

import { BenchmarkControls } from './components/benchmark-controls'
import { ReportSavePanel } from './components/report-save-panel'
import { ReportView } from './components/report-view'
import { ResultCard } from './components/result-card'
import { RunDetailDialog } from './components/run-detail-dialog'
import { ThemeToggle } from './components/theme-toggle'
import { useBenchmark } from './hooks/use-benchmark'
import type { BenchmarkModel, BenchmarkPrompt, RunResult } from './lib/types'

const DEFAULT_PROMPTS: BenchmarkPrompt[] = [
  {
    id: 'saas-hero-edit',
    text: 'Create a high-converting landing page for a compliance automation product called AuditPilot. It sells to operations leaders at mid-market fintech companies. Include a strong hero, proof metrics, feature sections, security reassurance, and a clear demo CTA.',
  },
  {
    id: 'restaurant-refresh',
    text: 'Create a single-page website for Lumen Table, a neighborhood restaurant that hosts seasonal chef dinners. The page needs a menu preview, reservation CTA, event schedule, location details, and warm editorial voice.',
  },
]

export function App() {
  const benchmark = useBenchmark()
  const [prompts, setPrompts] = useState(DEFAULT_PROMPTS)
  const [models, setModels] = useState<BenchmarkModel[]>(LANDING_MODEL_OPTIONS)
  const [concurrency, setConcurrency] = useState(1)
  const [detail, setDetail] = useState<null | RunResult>(null)

  const progressPercent = useMemo(() => {
    if (!benchmark.progress.total) return 0
    return Math.round(
      (benchmark.progress.completed / benchmark.progress.total) * 100,
    )
  }, [benchmark.progress.completed, benchmark.progress.total])

  return (
    <div className="grid min-h-svh bg-background text-foreground lg:h-svh lg:grid-cols-[22rem_1fr] lg:overflow-hidden">
      <BenchmarkControls
        concurrency={concurrency}
        isRunning={benchmark.isRunning}
        models={models}
        onConcurrencyChange={(value) =>
          setConcurrency(Number.isFinite(value) ? clamp(value, 1, 4) : 1)
        }
        onModelToggle={(model) => {
          setModels((current) =>
            current.some((entry) => entry.id === model.id)
              ? current.filter((entry) => entry.id !== model.id)
              : [...current, model],
          )
        }}
        onPromptChange={(id, text) =>
          setPrompts((current) =>
            current.map((prompt) =>
              prompt.id === id ? { ...prompt, text } : prompt,
            ),
          )
        }
        onRun={() => benchmark.run({ concurrency, models, prompts })}
        onStop={benchmark.stop}
        prompts={prompts}
      />
      <main className="flex min-h-svh min-w-0 flex-col lg:h-svh lg:min-h-0 lg:overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={benchmark.isRunning ? 'default' : 'outline'}>
                {benchmark.isRunning ? 'Running' : 'Ready'}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {benchmark.progress.completed}/{benchmark.progress.total || 0}{' '}
                runs complete
              </span>
            </div>
            <div className="h-1 w-full max-w-md overflow-hidden bg-muted">
              <div
                className="h-full bg-primary transition-[width] duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">{prompts.length} prompts</Badge>
            <Badge variant="secondary">{models.length} models</Badge>
            <Badge variant="outline">Concurrency {concurrency}</Badge>
            <ThemeToggle />
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
          <ReportView results={benchmark.results} />
          <ReportSavePanel
            concurrency={concurrency}
            isRunning={benchmark.isRunning}
            models={models}
            prompts={prompts}
            results={benchmark.results}
          />
          <Separator />
          {benchmark.results.length ? (
            <section className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
              {benchmark.results.map((result) => (
                <ResultCard
                  key={result.id}
                  onOpenDetail={setDetail}
                  result={result}
                />
              ))}
            </section>
          ) : (
            <Empty className="min-h-96 border bg-card">
              <EmptyTitle>Ready to compare real model behavior</EmptyTitle>
              <EmptyDescription>
                The benchmark creates draft projects, streams `/agent` with a
                selected text model, and renders each generated page here as a
                sandboxed card preview.
              </EmptyDescription>
            </Empty>
          )}
        </div>
      </main>
      <RunDetailDialog
        onOpenChange={(open) => {
          if (!open) setDetail(null)
        }}
        open={Boolean(detail)}
        result={detail}
      />
    </div>
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
