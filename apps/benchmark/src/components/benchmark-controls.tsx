import { LANDING_MODEL_OPTIONS } from '@workspace/prompt-panel'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Separator } from '@workspace/ui/components/separator'
import { Textarea } from '@workspace/ui/components/textarea'
import { PlayIcon, SquareIcon } from 'lucide-react'
import { useId, useMemo } from 'react'

import type { BenchmarkModel, BenchmarkPrompt } from '../lib/types'

export interface BenchmarkControlsProps {
  concurrency: number
  isRunning: boolean
  models: BenchmarkModel[]
  onConcurrencyChange: (value: number) => void
  onModelToggle: (model: BenchmarkModel) => void
  onPromptChange: (id: string, text: string) => void
  onRun: () => void
  onStop: () => void
  prompts: BenchmarkPrompt[]
}

export function BenchmarkControls({
  concurrency,
  isRunning,
  models,
  onConcurrencyChange,
  onModelToggle,
  onPromptChange,
  onRun,
  onStop,
  prompts,
}: BenchmarkControlsProps) {
  const concurrencyId = useId()
  const selectedModelIds = useMemo(
    () => new Set(models.map((model) => model.id)),
    [models],
  )
  const runCount = prompts.length * models.length
  const canRun = runCount > 0 && prompts.every((prompt) => prompt.text.trim())

  return (
    <aside className="flex h-full min-h-0 flex-col border-r bg-sidebar/60">
      <div className="flex flex-col gap-2 p-4">
        <Badge className="w-fit" variant="outline">
          Tool-calling matrix
        </Badge>
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-xl font-semibold tracking-tight">
            Landing Page Benchmark
          </h1>
          <p className="max-w-64 text-xs/relaxed text-muted-foreground">
            Run the same landing-page edits against each text model and compare
            the generated pages, cost, latency, retries, and tool mistakes.
          </p>
        </div>
      </div>
      <Separator />
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto p-4">
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Prompts
            </h2>
            <Badge variant="secondary">{prompts.length}</Badge>
          </div>
          <div className="flex flex-col gap-3">
            {prompts.map((prompt, index) => (
              <label className="flex flex-col gap-1" key={prompt.id}>
                <span className="text-xs font-medium">Prompt {index + 1}</span>
                <Textarea
                  aria-label={`Benchmark prompt ${index + 1}`}
                  className="min-h-24 resize-y"
                  disabled={isRunning}
                  onChange={(event) =>
                    onPromptChange(prompt.id, event.target.value)
                  }
                  value={prompt.text}
                />
              </label>
            ))}
          </div>
        </section>
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Text models
            </h2>
            <Badge variant="secondary">{models.length} selected</Badge>
          </div>
          <div className="flex flex-col gap-1">
            {LANDING_MODEL_OPTIONS.map((model) => {
              const checked = selectedModelIds.has(model.id)
              return (
                <label
                  className="flex min-h-9 cursor-pointer items-center gap-2 border px-2 py-1.5 text-xs transition-colors hover:bg-muted has-disabled:cursor-not-allowed has-disabled:opacity-50"
                  key={model.id}
                >
                  <input
                    checked={checked}
                    className="accent-primary"
                    disabled={isRunning}
                    onChange={() => onModelToggle(model)}
                    type="checkbox"
                  />
                  <span className="min-w-0 flex-1 truncate">{model.label}</span>
                </label>
              )
            })}
          </div>
        </section>
        <section className="flex flex-col gap-2">
          <label className="flex flex-col gap-1" htmlFor={concurrencyId}>
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Concurrency
            </span>
            <Input
              disabled={isRunning}
              id={concurrencyId}
              max={4}
              min={1}
              onChange={(event) =>
                onConcurrencyChange(Number(event.target.value))
              }
              type="number"
              value={concurrency}
            />
          </label>
          <p className="text-xs/relaxed text-muted-foreground">
            Keep this low when running real models. Each run creates a draft
            project and streams one `/agent` request.
          </p>
        </section>
      </div>
      <Separator />
      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Queued runs</span>
          <span>{runCount}</span>
        </div>
        {isRunning ? (
          <Button onClick={onStop} type="button" variant="destructive">
            <SquareIcon data-icon="inline-start" />
            Stop benchmark
          </Button>
        ) : (
          <Button disabled={!canRun} onClick={onRun} type="button">
            <PlayIcon data-icon="inline-start" />
            Run benchmark
          </Button>
        )}
      </div>
    </aside>
  )
}
