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
  projectId: string
  promptId: string
  promptText: string
  retryCount: number
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
    projectId: meta.projectId,
    promptId: meta.promptId,
    promptText: meta.promptText,
    retryCount: 0,
    startedAt: Date.now(),
    stats: {},
    status: 'running',
    text: '',
    toolCalls: [],
  }
}
