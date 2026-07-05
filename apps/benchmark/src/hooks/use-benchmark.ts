import { captureProjectScreenshot } from '@workspace/landing-preview'
import { useCallback, useRef, useState } from 'react'

import { applySseEvent, type ScreenshotRequest } from '../lib/run-reducer'
import {
  createProject,
  expandProjectImageUrls,
  postScreenshotError,
  postScreenshotResponse,
} from '../lib/server-api'
import { streamSSE } from '../lib/sse-client'
import {
  AGENT_API,
  createInitialRunResult,
  type BenchmarkModel,
  type BenchmarkPrompt,
  type PreviewDiagnostic,
  type RunResult,
  type RunResultMeta,
  type ScreenshotCaptureRecord,
} from '../lib/types'

export interface RunMatrixOptions {
  imageModel: BenchmarkModel
  models: BenchmarkModel[]
  prompts: BenchmarkPrompt[]
  visionModel: BenchmarkModel
}

export interface UseBenchmark {
  isRunning: boolean
  progress: { completed: number; total: number }
  recordPreviewDiagnostic: (
    runId: string,
    diagnostic: PreviewDiagnostic,
  ) => void
  recordScreenshotCapture: (
    runId: string,
    capture: ScreenshotCaptureRecord,
  ) => void
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

  // `resultsRef` is the synchronous source of truth for run state. SSE events
  // for a single run arrive sequentially (one awaited `reader.read()` at a
  // time) but faster than React re-renders. Updating this ref synchronously via
  // `commit` keeps consecutive text deltas chained correctly; computing each
  // event from React `results` state instead caused bursts to read the same
  // stale snapshot and clobber earlier deltas, scrambling the recorded text.
  const resultsRef = useRef<RunResult[]>([])

  const commit = useCallback((next: RunResult[]) => {
    resultsRef.current = next
    setResults(next)
  }, [])

  const mutateRun = useCallback(
    (id: string, fn: (r: RunResult) => RunResult) => {
      commit(resultsRef.current.map((r) => (r.id === id ? fn(r) : r)))
    },
    [commit],
  )

  const updateResult = useCallback(
    (id: string, fn: (r: RunResult) => RunResult) => mutateRun(id, fn),
    [mutateRun],
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
    setIsRunning(false)
    commit(
      resultsRef.current.map((r) =>
        r.status === 'running' || r.status === 'pending'
          ? { ...r, finishedAt: Date.now(), status: 'stopped' }
          : r,
      ),
    )
  }, [commit])

  const recordScreenshotCapture = useCallback(
    (runId: string, capture: ScreenshotCaptureRecord) => {
      mutateRun(runId, (r) => ({
        ...r,
        screenshotCaptures: [...r.screenshotCaptures, capture],
      }))
    },
    [mutateRun],
  )

  const recordPreviewDiagnostic = useCallback(
    (runId: string, diagnostic: PreviewDiagnostic) => {
      mutateRun(runId, (r) => ({
        ...r,
        previewDiagnostics: [...r.previewDiagnostics, diagnostic],
      }))
    },
    [mutateRun],
  )

  const run = useCallback(
    ({ imageModel, models, prompts, visionModel }: RunMatrixOptions) => {
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
      commit(initial)
      setIsRunning(true)
      setProgress({ completed: 0, total: matrix.length })

      let completed = 0
      void Promise.all(
        matrix.map(async (meta) => {
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
              {
                imageModel: imageModel.id,
                projectId,
                prompt: meta.promptText,
                textModel: meta.modelId,
                visionModel: visionModel.id,
              },
              {
                onEvent: ({ data, event }) => {
                  const { result: next, screenshotRequest } = applySseEvent(
                    readResult(resultsRef.current, meta.id),
                    { data, event },
                  )
                  // Commit synchronously so the next event (which may arrive
                  // before React re-renders) reads the freshly-accumulated state.
                  const nextWithProject = { ...next, projectId }
                  commit(
                    resultsRef.current.map((r) =>
                      r.id === meta.id ? nextWithProject : r,
                    ),
                  )
                  if (screenshotRequest) {
                    void answerScreenshotRequest(
                      meta.id,
                      screenshotRequest,
                      nextWithProject.html,
                      recordScreenshotCapture,
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
                ? {
                    ...r,
                    finishedAt: r.finishedAt ?? Date.now(),
                    status: 'done',
                  }
                : r,
            )
          }
        }),
      ).then(() => {
        setIsRunning(false)
        abortRef.current = null
      })
    },
    [commit, isRunning, recordScreenshotCapture, updateResult],
  )

  return {
    isRunning,
    progress,
    recordPreviewDiagnostic,
    recordScreenshotCapture,
    results,
    run,
    stop,
  }
}

/**
 * Answer a server screenshot request using the same client-preview capture path
 * the production editor uses. Records the capture (or failure) via the provided
 * callback so the saved report carries screenshot evidence instead of a forced
 * benchmark error.
 */
async function answerScreenshotRequest(
  runId: string,
  request: ScreenshotRequest,
  html: string,
  record: (runId: string, capture: ScreenshotCaptureRecord) => void,
): Promise<void> {
  const expanded = expandProjectImageUrls(html)
  const viewport = normalizeViewport(request.viewportSize)
  try {
    if (!expanded.trim()) {
      throw new Error('No preview HTML available for screenshot capture.')
    }
    const capture = await captureProjectScreenshot({
      html: expanded,
      selector: request.selector ?? '',
      viewportSize: viewport,
    })
    await postScreenshotResponse(request.requestId, {
      dataUrl: capture.dataUrl,
      height: capture.height,
      mediaType: capture.mediaType,
      width: capture.width,
    })
    record(runId, {
      at: Date.now(),
      dataUrlBytes: estimateDataUrlBytes(capture.dataUrl),
      height: capture.height,
      mediaType: capture.mediaType,
      requestId: request.requestId,
      selector: request.selector,
      status: 'captured',
      viewportSize: request.viewportSize,
      width: capture.width,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Screenshot capture failed.'
    await postScreenshotError(request.requestId, message).catch(() => undefined)
    record(runId, {
      at: Date.now(),
      errorMessage: message,
      requestId: request.requestId,
      selector: request.selector,
      status: 'error',
      viewportSize: request.viewportSize,
    })
  }
}

function createInitialRunResultPlaceholder(id: string): RunResult {
  return {
    editCount: 0,
    html: '',
    id,
    mistakes: [],
    modelId: '',
    modelLabel: '',
    previewDiagnostics: [],
    projectId: '',
    promptId: '',
    promptText: '',
    retryCount: 0,
    screenshotCaptures: [],
    startedAt: Date.now(),
    stats: {},
    status: 'pending',
    text: '',
    toolCalls: [],
  }
}

function estimateDataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.split(',', 2)[1] ?? ''
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding)
}

function normalizeViewport(
  value: string | undefined,
): 'desktop' | 'mobile' | 'tablet' {
  if (value === 'tablet') return 'tablet'
  if (value === 'desktop') return 'desktop'
  return 'mobile'
}

function readResult(results: RunResult[], id: string): RunResult {
  return (
    results.find((r) => r.id === id) ?? createInitialRunResultPlaceholder(id)
  )
}

// Re-export the helper so cards can expand image URLs without a second import.
export { expandProjectImageUrls }
