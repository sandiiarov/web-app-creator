import { useCallback, useRef, useState } from 'react'

import { applySseEvent } from '../lib/run-reducer'
import {
  createProject,
  expandProjectImageUrls,
  postScreenshotError,
} from '../lib/server-api'
import { streamSSE } from '../lib/sse-client'
import {
  AGENT_API,
  createInitialRunResult,
  type BenchmarkModel,
  type BenchmarkPrompt,
  type RunResult,
  type RunResultMeta,
} from '../lib/types'

export interface RunMatrixOptions {
  concurrency: number
  models: BenchmarkModel[]
  prompts: BenchmarkPrompt[]
}

export interface UseBenchmark {
  isRunning: boolean
  progress: { completed: number; total: number }
  results: RunResult[]
  run: (options: RunMatrixOptions) => void
  stop: () => void
}

let runSeq = 0

export function useBenchmark(): UseBenchmark {
  const [results, setResults] = useState<RunResult[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState({ completed: 0, total: 0 })
  const abortRef = useRef<AbortController | null>(null)

  const updateResult = useCallback(
    (id: string, fn: (r: RunResult) => RunResult) => {
      setResults((prev) => prev.map((r) => (r.id === id ? fn(r) : r)))
    },
    [],
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
    setIsRunning(false)
    setResults((prev) =>
      prev.map((r) =>
        r.status === 'running' || r.status === 'pending'
          ? { ...r, finishedAt: Date.now(), status: 'stopped' }
          : r,
      ),
    )
  }, [])

  const run = useCallback(
    ({ concurrency, models, prompts }: RunMatrixOptions) => {
      if (isRunning) return
      const controller = new AbortController()
      abortRef.current = controller

      const matrix: RunResultMeta[] = models.flatMap((model) =>
        prompts.map((prompt) => ({
          id: `run-${Date.now()}-${runSeq++}`,
          modelId: model.id,
          modelLabel: model.label,
          projectId: '',
          promptId: prompt.id,
          promptText: prompt.text,
        })),
      )

      const initial: RunResult[] = matrix.map((meta) => ({
        ...createInitialRunResult(meta),
        status: 'pending',
      }))
      setResults(initial)
      setIsRunning(true)
      setProgress({ completed: 0, total: matrix.length })

      let completed = 0
      void pool(matrix, Math.max(1, concurrency), async (meta) => {
        if (controller.signal.aborted) return
        let projectId = ''
        try {
          const project = await createProject({
            model: meta.modelId,
            title: `${meta.modelLabel} · ${meta.promptText.slice(0, 40)}`,
          })
          projectId = project.id
          updateResult(meta.id, (r) => ({
            ...r,
            projectId,
            startedAt: Date.now(),
            status: 'running',
          }))

          await streamSSE(
            AGENT_API,
            { projectId, prompt: meta.promptText, textModel: meta.modelId },
            {
              onEvent: ({ data, event }) => {
                const { result, screenshotRequest } = applySseEvent(
                  readResult(resultsRef.current, meta.id),
                  { data, event },
                )
                const withProject = { ...result, projectId }
                setResults((prev) =>
                  prev.map((r) => (r.id === meta.id ? withProject : r)),
                )
                if (screenshotRequest) {
                  // The benchmark does not render preview captures; answer
                  // promptly so the screenshot tool fails fast instead of
                  // hanging on its timeout.
                  void postScreenshotError(
                    screenshotRequest.requestId,
                    'Benchmark does not capture browser screenshots.',
                  )
                }
              },
              signal: controller.signal,
            },
          )
        } catch (error) {
          const message = controller.signal.aborted
            ? 'stopped'
            : error instanceof Error
              ? error.message
              : String(error)
          updateResult(meta.id, (r) => ({
            ...r,
            error: message === 'stopped' ? undefined : message,
            finishedAt: Date.now(),
            projectId,
            status: controller.signal.aborted ? 'stopped' : 'error',
          }))
        } finally {
          completed += 1
          setProgress({ completed, total: matrix.length })
          updateResult(meta.id, (r) =>
            r.status === 'pending' || r.status === 'running'
              ? { ...r, finishedAt: r.finishedAt ?? Date.now(), status: 'done' }
              : r,
          )
        }
      }).then(() => {
        setIsRunning(false)
        abortRef.current = null
      })
    },
    [isRunning, updateResult],
  )

  // Keep a live ref so the SSE callback can read the latest result without
  // re-subscribing on every state change.
  const resultsRef = useRef(results)
  resultsRef.current = results

  return { isRunning, progress, results, run, stop }
}

function createInitialRunResultPlaceholder(id: string): RunResult {
  return {
    editCount: 0,
    html: '',
    id,
    mistakes: [],
    modelId: '',
    modelLabel: '',
    projectId: '',
    promptId: '',
    promptText: '',
    retryCount: 0,
    startedAt: Date.now(),
    stats: {},
    status: 'pending',
    text: '',
    toolCalls: [],
  }
}

async function pool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (cursor < items.length) {
        const index = cursor++
        await fn(items[index]!)
      }
    },
  )
  await Promise.all(workers)
}

function readResult(results: RunResult[], id: string): RunResult {
  return (
    results.find((r) => r.id === id) ?? createInitialRunResultPlaceholder(id)
  )
}

// Re-export the helper so cards can expand image URLs without a second import.
export { expandProjectImageUrls }
