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

/** Per-1M-token USD prices from the OpenRouter catalog (snapshot). */
export type LandingModelPricing = {
  cacheRead?: number
  input: number
  output: number
}

export type LandingModelRole = 'image' | 'text' | 'vision'

// All model ids are OpenRouter slugs, verified live against the OpenRouter API.
export const TEXT_MODEL_OPTIONS: LandingModelOption[] = [
  { id: 'z-ai/glm-5.2:nitro', label: 'GLM 5.2' },
  { id: 'tencent/hy3:nitro', label: 'Tencent Hy3' },
  { id: 'moonshotai/kimi-k2.7-code:nitro', label: 'Kimi K2.7 Code' },
  { id: 'moonshotai/kimi-k3:nitro', label: 'Kimi K3' },
  {
    id: 'deepseek/deepseek-v4-flash-0731:nitro',
    label: 'DeepSeek V4 Flash 0731',
  },
  {
    id: 'nvidia/nemotron-3-ultra-550b-a55b:nitro',
    label: 'Nemotron Ultra',
  },
  { id: 'poolside/laguna-s-2.1:nitro', label: 'Laguna S 2.1' },
  { id: 'anthropic/claude-opus-5:nitro', label: 'Claude Opus 5' },
  { id: 'anthropic/claude-sonnet-5:nitro', label: 'Claude Sonnet 5' },
  { id: 'anthropic/claude-haiku-4.5:nitro', label: 'Claude Haiku 4.5' },
  { id: 'openai/gpt-5.6-luna:nitro', label: 'GPT-5.6 Luna' },
  { id: 'openai/gpt-5.6-terra:nitro', label: 'GPT-5.6 Terra' },
  { id: 'openai/gpt-5.6-sol:nitro', label: 'GPT-5.6 Sol' },
]

export const IMAGE_MODEL_OPTIONS: LandingModelOption[] = [
  { id: 'bytedance-seed/seedream-4.5', label: 'Seedream 4.5' },
  { id: 'google/gemini-3.1-flash-lite-image', label: 'Gemini 3.1 Flash Lite' },
  { id: 'openai/gpt-image-2', label: 'GPT Image 2' },
  { id: 'x-ai/grok-imagine-image-quality', label: 'Grok Imagine' },
]

export const VISION_MODEL_OPTIONS: LandingModelOption[] = [
  { id: 'bytedance-seed/seed-2.0-mini', label: 'Seed 2.0 Mini' },
  { id: 'z-ai/glm-5v-turbo', label: 'GLM 5V Turbo' },
  { id: 'moonshotai/kimi-k2.7-code', label: 'Kimi K2.7 Code' },
  { id: 'moonshotai/kimi-k3', label: 'Kimi K3' },
  { id: 'minimax/minimax-m3', label: 'MiniMax M3' },
  { id: 'xiaomi/mimo-v2.5', label: 'MiMo V2.5' },
  { id: 'anthropic/claude-opus-5', label: 'Claude Opus 5' },
  { id: 'anthropic/claude-sonnet-5', label: 'Claude Sonnet 5' },
  { id: 'anthropic/claude-haiku-4.5', label: 'Claude Haiku 4.5' },
  { id: 'openai/gpt-5.6-luna', label: 'GPT-5.6 Luna' },
  { id: 'openai/gpt-5.6-terra', label: 'GPT-5.6 Terra' },
  { id: 'openai/gpt-5.6-sol', label: 'GPT-5.6 Sol' },
]

/**
 * Per-1M-token USD prices keyed by base model id (no `:nitro` suffix),
 * snapshotted from the OpenRouter catalog. Refresh when models are
 * added/updated. Image-generation-only models (Seedream, GPT Image, Grok)
 * are not in the chat catalog, so they have no entry.
 */
export const MODEL_PRICING: Record<string, LandingModelPricing> = {
  'anthropic/claude-haiku-4.5': { cacheRead: 0.1, input: 1, output: 5 },
  'anthropic/claude-opus-5': { cacheRead: 0.5, input: 5, output: 25 },
  'anthropic/claude-sonnet-5': { cacheRead: 0.2, input: 2, output: 10 },
  'bytedance-seed/seed-2.0-mini': { input: 0.1, output: 0.4 },
  'deepseek/deepseek-v4-flash-0731': {
    cacheRead: 0.018,
    input: 0.09,
    output: 0.18,
  },
  'google/gemini-3.1-flash-lite-image': { input: 0.25, output: 1.5 },
  'minimax/minimax-m3': { cacheRead: 0.06, input: 0.3, output: 1.2 },
  'moonshotai/kimi-k2.7-code': { cacheRead: 0.15, input: 0.73, output: 3.5 },
  'moonshotai/kimi-k3': { cacheRead: 0.3, input: 3, output: 15 },
  'nvidia/nemotron-3-ultra-550b-a55b': {
    cacheRead: 0.2,
    input: 0.6,
    output: 3.6,
  },
  'openai/gpt-5.6-luna': { cacheRead: 0.01, input: 0.1, output: 0.6 },
  'openai/gpt-5.6-sol': { cacheRead: 0.5, input: 5, output: 30 },
  'openai/gpt-5.6-terra': { cacheRead: 0.1, input: 1, output: 6 },
  'poolside/laguna-s-2.1': { cacheRead: 0.009, input: 0.09, output: 0.18 },
  'tencent/hy3': { cacheRead: 0.033, input: 0.132, output: 0.528 },
  'xiaomi/mimo-v2.5': { cacheRead: 0.0028, input: 0.14, output: 0.28 },
  'z-ai/glm-5.2': { cacheRead: 0.078, input: 0.42, output: 1.32 },
  'z-ai/glm-5v-turbo': { cacheRead: 0.24, input: 1.2, output: 4 },
}

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

export type ElementAttachmentInput = ElementAttachmentMeta

// Element attachments carry only a stable CSS selector — the server captures
// the actual screenshot(s). They never transport a dataUrl.
export type ElementAttachmentMeta = {
  analysisText?: string
  id: string
  kind: 'element'
  name: string
  selector: string
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

export type ToolCallImage = {
  alt: string
  url: string
}

export type ToolCallPart = {
  action: null | string
  detail?: null | string
  id: string
  images?: ToolCallImage[]
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

/**
 * Format a per-1M-token USD price compactly: two decimals at or above $1,
 * two significant figures below.
 */
export function formatTokenPrice(perMillionUsd: number) {
  const rounded =
    perMillionUsd >= 1
      ? Math.round(perMillionUsd * 100) / 100
      : Number(perMillionUsd.toPrecision(2))
  return `$${rounded}`
}

export function formatTokenUsage(usage: TokenUsage | undefined) {
  if (!usage) return null
  return formatTokenCount(usage.totalTokens)
}

/**
 * Look up per-1M-token USD pricing for a model id, tolerating OpenRouter
 * routing-variant suffixes like `:nitro`. Pass a live catalog map (from the
 * server's `/api/models` proxy) to override the bundled static snapshot.
 */
export function modelPricingFor(
  modelId: string,
  pricing: Record<string, LandingModelPricing> = MODEL_PRICING,
) {
  return pricing[modelId.replace(/:(?:floor|free|nitro|online)$/, '')]
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
    text: resolveTextModel(input.text),
    vision: input.vision?.trim() || DEFAULT_LANDING_MODELS.vision,
  }
}

function resolveTextModel(input: string | undefined) {
  const model = input?.trim()
  if (!model) return DEFAULT_LANDING_MODELS.text
  const base = model.replace(/:(?:floor|free|nitro|online)$/, '')
  return `${base}:nitro`
}
