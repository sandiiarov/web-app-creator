export const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'

export const LANDING_AGENT_API = `${SERVER_URL}/agent`

export type LandingModelOption = {
  id: string
  label: string
}

export const LANDING_MODEL_OPTIONS: LandingModelOption[] = [
  { id: 'zai-org/GLM-5.2', label: 'GLM 5.2' },
  { id: 'moonshotai/Kimi-K2.7-Code', label: 'Kimi K2.7 Code' },
]

// ── SSE event payloads (server → client) ──────────────────────────

export type CostBreakdown = {
  image?: ImageCost
  llm: number
  scrape: ScrapeCost
  total: number
}

export type ErrorEvent = { message: string }

export type ImageAttachmentInput = ImageAttachmentMeta & {
  dataUrl: string
}

export type ImageAttachmentMediaType =
  | 'image/gif'
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'

export type ImageAttachmentMeta = {
  analysisText?: string
  id: string
  mediaType: ImageAttachmentMediaType
  name: string
  size: number
}

export type ImageCost = {
  cost: number
  count: number
}

export type LandingAgentSendInput = {
  attachments?: ImageAttachmentInput[]
  prompt: string
}

export type LandingTurn = {
  attachments?: ImageAttachmentMeta[]
  error?: string
  htmlSwaps: number
  id: string
  isStreaming: boolean
  model: string
  parts: TurnPart[]
  prompt: string
}

export type ScrapeCost = {
  calls: number
  cost: number
  credits: number
  firecrawlCost?: number
  ocrCalls?: number
  ocrCost?: number
  ocrImages?: number
}

export type StatsEvent = {
  cost: number
  costBreakdown?: CostBreakdown
  durationMs: number
  finishReason: string
  model: string
  usage: TokenUsage
}

export type StatsPart = {
  cost: number
  costBreakdown?: CostBreakdown
  durationMs: number
  finishReason: string
  model: string
  type: 'stats'
  usage: TokenUsage
}
export type TextEvent = { delta: string }
export type TextPart = {
  id: string
  text: string
  type: 'text'
}
export type ThinkingEvent = { delta: string }
export type ThinkingPart = {
  id: string
  text: string
  type: 'thinking'
}

// ── Conversation model ────────────────────────────────────────────

export type TokenUsage = {
  cachedInputTokens?: number
  inputTokens?: number
  outputTokens?: number
  reasoningTokens?: number
  totalTokens?: number
}

export type ToolCallEvent = {
  detail?: null | string
  id: string
  intent: null | string
  providerId?: string
  result?: null | string
  state: ToolCallState
  tool: string
}

export type ToolCallPart = {
  detail?: null | string
  id: string
  intent: null | string
  providerId?: string
  result?: null | string
  state: ToolCallState
  tool: string
  type: 'tool_call'
}

export type ToolCallState = 'done' | 'error' | 'running' | 'start'

export type TurnPart = StatsPart | TextPart | ThinkingPart | ToolCallPart

// ── Formatting utilities ──────────────────────────────────────────

export function formatCost(cost: number) {
  return cost >= 0.01 ? `$${cost.toFixed(4)}` : '<$0.01'
}

export function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${Math.round(seconds % 60)}s`
}

export function formatTokenCount(tokens: number | undefined) {
  if (typeof tokens !== 'number') return null
  if (tokens >= 1000) {
    const thousands = tokens / 1000
    return `${Number(thousands.toFixed(thousands >= 100 ? 0 : 1))}k`
  }
  return String(tokens)
}

export function formatTokenUsage(usage: TokenUsage | undefined) {
  if (!usage) return null
  return formatTokenCount(usage.totalTokens)
}
