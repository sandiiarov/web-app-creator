// Landing conversation domain model.
//
// Owns the types the prompt panel renders, the model picker options, and the
// formatting helpers used by turn metadata. The SSE transport layer (server
// URL, wire event payloads) lives in the consuming app; this module must not
// reference app code or `import.meta.env`.

export type LandingModelOption = {
  id: string
  label: string
}

export const LANDING_MODEL_OPTIONS: LandingModelOption[] = [
  { id: 'zai-org/GLM-5.2', label: 'GLM 5.2' },
  { id: 'moonshotai/Kimi-K2.7-Code', label: 'Kimi K2.7 Code' },
]

// ── Attachments ───────────────────────────────────────────────────

export type CostBreakdown = {
  image?: ImageCost
  llm: number
  scrape: ScrapeCost
  total: number
  vision?: VisionCost
}

export type ElementAttachmentInput = ElementAttachmentMeta & {
  dataUrl: string
}

export type ElementAttachmentMeta = {
  analysisText?: string
  html: string
  id: string
  kind: 'element'
  mediaType: ScreenshotMediaType
  name: string
  screenshotHeight: number
  screenshotWidth: number
  selector?: string
  size: number
}

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
  kind?: 'image'
  mediaType: ImageAttachmentMediaType
  name: string
  size: number
}

export type ImageCost = {
  cost: number
  count: number
}

export type LandingAgentSendInput = {
  attachments?: PromptAttachmentInput[]
  prompt: string
}

// ── Conversation model ────────────────────────────────────────────

export type LandingTurn = {
  attachments?: PromptAttachmentMeta[]
  error?: string
  htmlSwaps: number
  id: string
  isStreaming: boolean
  model: string
  parts: TurnPart[]
  prompt: string
}

export type PromptAttachmentInput =
  | ElementAttachmentInput
  | ImageAttachmentInput

export type PromptAttachmentMeta = ElementAttachmentMeta | ImageAttachmentMeta

export type RetryPart = {
  attempt: number
  delayMs: number
  id: string
  issue: string
  maxAttempts: number
  reason: string
  startedAt: number
  type: 'retry'
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

export type ScreenshotMediaType = 'image/jpeg' | 'image/png' | 'image/webp'

export type StatsPart = {
  cost: number
  costBreakdown?: CostBreakdown
  durationMs: number
  finishReason: string
  model: string
  type: 'stats'
  usage: TokenUsage
}

export type TextPart = {
  id: string
  text: string
  type: 'text'
}

export type ThinkingPart = {
  id: string
  text: string
  type: 'thinking'
}

export type TokenUsage = {
  cachedInputTokens?: number
  inputTokens?: number
  outputTokens?: number
  reasoningTokens?: number
  totalTokens?: number
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

export type TurnPart =
  | RetryPart
  | StatsPart
  | TextPart
  | ThinkingPart
  | ToolCallPart

export type VisionCost = {
  calls: number
  cost: number
  images: number
}

// ── Formatting utilities ──────────────────────────────────────────

export function formatCost(cost: number) {
  if (!Number.isFinite(cost) || cost <= 0) return '$0'
  return cost >= 0.01 ? `$${cost.toFixed(4)}` : '<$0.01'
}

export function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${Math.round(seconds % 60)}s`
}

export function formatRetryDelay(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return 'now'
  const seconds = ms / 1000
  return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`
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
