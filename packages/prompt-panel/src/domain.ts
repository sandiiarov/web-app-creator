// Landing conversation domain model.
//
// Owns the types the prompt panel renders, the model picker options, and the
// formatting helpers used by turn metadata. The SSE transport layer (server
// URL, wire event payloads) lives in the consuming app; this module must not
// reference app code or `import.meta.env`.

export interface LandingModelGroup {
  options: LandingModelOption[]
  role: LandingModelRole
  title: string
}

export type LandingModelOption = {
  id: string
  label: string
}

export type LandingModelRole = 'image' | 'text' | 'vision'

// All model ids are OpenRouter slugs, verified live against the OpenRouter API.
export const TEXT_MODEL_OPTIONS: LandingModelOption[] = [
  { id: 'z-ai/glm-5.2', label: 'GLM 5.2' },
  { id: 'tencent/hy3', label: 'Tencent Hy3' },
  { id: 'moonshotai/kimi-k2.7-code', label: 'Kimi K2.7 Code' },
  { id: 'deepseek/deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
  { id: 'nvidia/nemotron-3-ultra-550b-a55b', label: 'Nemotron Ultra' },
]

export const IMAGE_MODEL_OPTIONS: LandingModelOption[] = [
  { id: 'bytedance-seed/seedream-4.5', label: 'Seedream 4.5' },
  { id: 'google/gemini-3.1-flash-lite-image', label: 'Gemini 3.1 Flash Lite' },
  { id: 'openai/gpt-image-2', label: 'GPT Image 2' },
  { id: 'x-ai/grok-imagine-image-quality', label: 'Grok Imagine' },
]

export const VISION_MODEL_OPTIONS: LandingModelOption[] = [
  { id: 'z-ai/glm-5v-turbo', label: 'GLM 5V Turbo' },
  { id: 'moonshotai/kimi-k2.7-code', label: 'Kimi K2.7 Code' },
  { id: 'minimax/minimax-m3', label: 'MiniMax M3' },
  { id: 'xiaomi/mimo-v2.5', label: 'MiMo V2.5' },
]

export const LANDING_MODEL_GROUPS: LandingModelGroup[] = [
  { options: TEXT_MODEL_OPTIONS, role: 'text', title: 'Text (agent brain)' },
  { options: IMAGE_MODEL_OPTIONS, role: 'image', title: 'Image (generation)' },
  { options: VISION_MODEL_OPTIONS, role: 'vision', title: 'Vision (OCR)' },
]

// Backward-compatible aliases for the text model list.
export const LANDING_MODEL_OPTIONS = TEXT_MODEL_OPTIONS
export const LANDING_IMAGE_MODEL_OPTIONS = IMAGE_MODEL_OPTIONS
export const LANDING_VISION_MODEL_OPTIONS = VISION_MODEL_OPTIONS

/** Per-category model selection for a project (text + vision + image). */
export type LandingModels = {
  image: string
  text: string
  vision: string
}

export const DEFAULT_LANDING_MODELS: LandingModels = {
  image: IMAGE_MODEL_OPTIONS[0]!.id,
  text: TEXT_MODEL_OPTIONS[0]!.id,
  vision: VISION_MODEL_OPTIONS[0]!.id,
}

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
  stopped?: boolean
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
  action: null | string
  detail?: null | string
  id: string
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
  if (!Number.isFinite(cost) || cost <= 0) return '$0.0000'
  return `$${cost.toFixed(4)}`
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

/**
 * Build a complete `LandingModels` from a partial persisted selection,
 * falling back to the defaults for any missing/blank category. Used when
 * restoring a project whose metadata only carried a subset of the categories.
 */
export function resolveLandingModels(input: {
  image?: string
  text?: string
  vision?: string
}): LandingModels {
  return {
    image: input.image?.trim() || DEFAULT_LANDING_MODELS.image,
    text: input.text?.trim() || DEFAULT_LANDING_MODELS.text,
    vision: input.vision?.trim() || DEFAULT_LANDING_MODELS.vision,
  }
}
