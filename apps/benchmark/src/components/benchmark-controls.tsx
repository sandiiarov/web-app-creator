import {
  LANDING_IMAGE_MODEL_OPTIONS,
  LANDING_MODEL_OPTIONS,
  LANDING_VISION_MODEL_OPTIONS,
} from '@workspace/prompt-panel'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Separator } from '@workspace/ui/components/separator'
import { Textarea } from '@workspace/ui/components/textarea'
import { PlayIcon, PlusIcon, SquareIcon, Trash2Icon } from 'lucide-react'
import { useMemo } from 'react'

import type { BenchmarkModel, BenchmarkPrompt } from '../lib/types'

export interface BenchmarkControlsProps {
  imageModel: BenchmarkModel
  isRunning: boolean
  models: BenchmarkModel[]
  onImageModelChange: (model: BenchmarkModel) => void
  onModelToggle: (model: BenchmarkModel) => void
  onPromptAdd: () => void
  onPromptChange: (id: string, text: string) => void
  onPromptRemove: (id: string) => void
  onRun: () => void
  onStop: () => void
  onVisionModelChange: (model: BenchmarkModel) => void
  prompts: BenchmarkPrompt[]
  visionModel: BenchmarkModel
}

export function BenchmarkControls({
  imageModel,
  isRunning,
  models,
  onImageModelChange,
  onModelToggle,
  onPromptAdd,
  onPromptChange,
  onPromptRemove,
  onRun,
  onStop,
  onVisionModelChange,
  prompts,
  visionModel,
}: BenchmarkControlsProps) {
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
            Run every selected text model in parallel while keeping image
            generation and visual review models fixed across the matrix.
          </p>
        </div>
      </div>
      <Separator />
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto p-4">
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Prompts
              </h2>
              <Badge variant="secondary">{prompts.length}</Badge>
            </div>
            <Button
              disabled={isRunning}
              onClick={onPromptAdd}
              size="xs"
              type="button"
              variant="outline"
            >
              <PlusIcon data-icon="inline-start" />
              Add
            </Button>
          </div>
          <div className="flex flex-col gap-3">
            {prompts.map((prompt, index) => (
              <div className="flex flex-col gap-1" key={prompt.id}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium">
                    Prompt {index + 1}
                  </span>
                  {prompts.length > 1 ? (
                    <Button
                      aria-label={`Remove prompt ${index + 1}`}
                      disabled={isRunning}
                      onClick={() => onPromptRemove(prompt.id)}
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2Icon />
                    </Button>
                  ) : null}
                </div>
                <Textarea
                  aria-label={`Benchmark prompt ${index + 1}`}
                  className="min-h-24 resize-y"
                  disabled={isRunning}
                  onChange={(event) =>
                    onPromptChange(prompt.id, event.target.value)
                  }
                  value={prompt.text}
                />
              </div>
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
        <SingleModelGroup
          disabled={isRunning}
          label="Image generation"
          models={LANDING_IMAGE_MODEL_OPTIONS}
          onChange={onImageModelChange}
          selected={imageModel}
        />
        <SingleModelGroup
          disabled={isRunning}
          label="Vision review"
          models={LANDING_VISION_MODEL_OPTIONS}
          onChange={onVisionModelChange}
          selected={visionModel}
        />
      </div>
      <Separator />
      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Parallel runs</span>
          <span>{runCount}</span>
        </div>
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          <span className="truncate">Image: {imageModel.label}</span>
          <span className="truncate">Vision: {visionModel.label}</span>
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

function SingleModelGroup({
  disabled,
  label,
  models,
  onChange,
  selected,
}: {
  disabled: boolean
  label: string
  models: BenchmarkModel[]
  onChange: (model: BenchmarkModel) => void
  selected: BenchmarkModel
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {label}
        </h2>
        <Badge className="max-w-32 truncate" variant="secondary">
          {selected.label}
        </Badge>
      </div>
      <div className="flex flex-col gap-1">
        {models.map((model) => (
          <label
            className="flex min-h-9 cursor-pointer items-center gap-2 border px-2 py-1.5 text-xs transition-colors hover:bg-muted has-disabled:cursor-not-allowed has-disabled:opacity-50"
            key={model.id}
            onClick={() => {
              if (!disabled) onChange(model)
            }}
          >
            <input
              checked={selected.id === model.id}
              className="accent-primary"
              disabled={disabled}
              name={label}
              onChange={() => onChange(model)}
              type="radio"
            />
            <span className="min-w-0 flex-1 truncate">{model.label}</span>
          </label>
        ))}
      </div>
    </section>
  )
}
