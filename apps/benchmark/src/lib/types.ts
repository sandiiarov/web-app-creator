import type { PreviewDiagnostic } from '@workspace/landing-preview'
import type {
  CostBreakdown,
  LandingModelOption,
  TokenUsage,
  ToolCallState,
} from '@workspace/prompt-panel'

export const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'

export const AGENT_API = `${SERVER_URL}/agent`

export type { LandingModelOption }

/** A model under test. Alias of the prompt-panel model option shape. */
export type BenchmarkModel = LandingModelOption

export interface BenchmarkPrompt {
  id: string
  text: string
}

export interface BenchmarkReport {
  aggregates: BenchmarkReportAggregate[]
  app: 'benchmark'
  generatedAt: string
  reportVersion: string
  runConfig: BenchmarkRunConfig
  runs: BenchmarkReportRun[]
  serverUrl: string
  summary: BenchmarkReportSummary
  userFeedback: BenchmarkUserFeedback
}

export interface BenchmarkReportAggregate {
  averageCost?: number
  averageDurationMs?: number
  averageMistakes: number
  doneRuns: number
  errorRuns: number
  modelId: string
  modelLabel: string
  stoppedRuns: number
  totalCost: number
  totalEdits: number
  totalMistakes: number
  totalRetries: number
  totalRuns: number
  totalToolCalls: number
}

export interface BenchmarkReportRun {
  durationMs?: number
  editCount: number
  error?: string
  finishedAt?: string
  html: string
  htmlBytes: number
  id: string
  mistakes: Mistake[]
  modelId: string
  modelLabel: string
  previewDiagnostics: PreviewDiagnostic[]
  projectId: string
  promptId: string
  promptText: string
  retryCount: number
  screenshotCaptures: ScreenshotCaptureRecord[]
  startedAt: string
  stats: RunStats
  status: RunStatus
  text: string
  toolCalls: ToolCallSummary[]
}

export interface BenchmarkReportSummary {
  averageDurationMs?: number
  completedRuns: number
  doneRuns: number
  errorRuns: number
  finishedAt?: string
  modelCount: number
  promptCount: number
  runCount: number
  startedAt?: string
  stoppedRuns: number
  totalCost: number
  totalEdits: number
  totalMistakes: number
  totalRetries: number
  totalToolCalls: number
}

export interface BenchmarkRunConfig {
  concurrency: number
  models: BenchmarkModel[]
  prompts: BenchmarkPrompt[]
  screenshotCapture: BenchmarkScreenshotCaptureMode
}

export type BenchmarkScreenshotCaptureMode =
  | 'client-preview-capture'
  | 'disabled-fast-error'

export interface BenchmarkUserFeedback {
  notes: string
  problemAreas: FeedbackProblemArea[]
  rating: FeedbackRating
  requestedAdjustment: string
}

export type FeedbackProblemArea =
  | 'cost'
  | 'model_choice'
  | 'prompts'
  | 'reliability'
  | 'tool_behavior'
  | 'visual_output'

export type FeedbackRating = 'failed' | 'needs-work' | 'useful'

export interface Mistake {
  at: number
  kind: MistakeKind
  message: string
  tool?: string
}

export type MistakeKind = 'retry' | 'tool_error' | 'turn_error'

export interface RunResult {
  editCount: number
  error?: string
  finishedAt?: number
  html: string
  id: string
  mistakes: Mistake[]
  modelId: string
  modelLabel: string
  previewDiagnostics: PreviewDiagnostic[]
  projectId: string
  promptId: string
  promptText: string
  retryCount: number
  screenshotCaptures: ScreenshotCaptureRecord[]
  startedAt: number
  stats: RunStats
  status: RunStatus
  text: string
  toolCalls: ToolCallSummary[]
}

export interface RunResultMeta {
  id: string
  modelId: string
  modelLabel: string
  projectId: string
  promptId: string
  promptText: string
}

export interface RunStats {
  cost?: number
  costBreakdown?: CostBreakdown
  durationMs?: number
  finishReason?: string
  model?: string
  usage?: TokenUsage
}

export type RunStatus = 'done' | 'error' | 'pending' | 'running' | 'stopped'

export type { PreviewDiagnostic }

export interface ScreenshotCaptureRecord {
  at: number
  dataUrlBytes?: number
  errorMessage?: string
  height?: number
  mediaType?: string
  requestId: string
  selector?: string
  status: 'captured' | 'error'
  viewportSize?: string
  width?: number
}

export interface ToolCallSummary {
  detail?: null | string
  id: string
  intent: null | string
  result?: null | string
  state: ToolCallState
  tool: string
}

export function createInitialRunResult(meta: RunResultMeta): RunResult {
  return {
    editCount: 0,
    html: '',
    id: meta.id,
    mistakes: [],
    modelId: meta.modelId,
    modelLabel: meta.modelLabel,
    previewDiagnostics: [],
    projectId: meta.projectId,
    promptId: meta.promptId,
    promptText: meta.promptText,
    retryCount: 0,
    screenshotCaptures: [],
    startedAt: Date.now(),
    stats: {},
    status: 'running',
    text: '',
    toolCalls: [],
  }
}
