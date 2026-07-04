import {
  type CostBreakdown,
  type ScreenshotMediaType,
  type TokenUsage,
  type ToolCallState,
} from '@workspace/prompt-panel'

export const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'

export const LANDING_AGENT_API = `${SERVER_URL}/agent`

// ── SSE event payloads (server → client) ──────────────────────────
//
// Wire types for the custom SSE stream. The domain/conversation model they
// build into (LandingTurn, TurnPart variants, cost/usage types, formatters)
// lives in @workspace/prompt-panel and is re-exported below.

export type ErrorEvent = { message: string }

export type HtmlUpdateEvent = {
  bytes: number
  hash: string
  html: string
  previousHash: string
  projectId: string
  sequence: number
}

export type RetryEvent = {
  attempt: number
  delayMs: number
  issue: string
  maxAttempts: number
  reason: string
}

export const SCREENSHOT_VIEWPORT_SIZES = [
  'mobile',
  'tablet',
  'desktop',
] as const

export type ScreenshotRequestEvent = {
  projectId: string
  requestId: string
  selector: string
  viewportSize: ScreenshotViewportSize
}

export type ScreenshotResponseInput =
  | {
      dataUrl: string
      height: number
      mediaType: ScreenshotMediaType
      width: number
    }
  | { error: string }

export type ScreenshotViewportSize = (typeof SCREENSHOT_VIEWPORT_SIZES)[number]

export type StatsEvent = {
  cost: number
  costBreakdown?: CostBreakdown
  durationMs: number
  finishReason: string
  model: string
  usage: TokenUsage
}

export type TextEvent = { delta: string }
export type ThinkingEvent = { delta: string }

export type ToolCallEvent = {
  detail?: null | string
  id: string
  intent: null | string
  providerId?: string
  result?: null | string
  state: ToolCallState
  tool: string
}

// ── Domain model (re-exported from @workspace/prompt-panel) ─────────

export type {
  CostBreakdown,
  ElementAttachmentInput,
  ElementAttachmentMeta,
  ImageAttachmentInput,
  ImageAttachmentMediaType,
  ImageAttachmentMeta,
  LandingAgentSendInput,
  LandingModelOption,
  LandingModelRole,
  LandingModels,
  LandingTurn,
  PromptAttachmentInput,
  PromptAttachmentMeta,
  RetryPart,
  ScreenshotMediaType,
  StatsPart,
  TextPart,
  ThinkingPart,
  TokenUsage,
  ToolCallPart,
  ToolCallState,
  TurnPart,
  VisionCost,
} from '@workspace/prompt-panel'

export type { ImageCost, ScrapeCost } from '@workspace/prompt-panel'

export {
  DEFAULT_LANDING_MODELS,
  formatCost,
  formatDuration,
  formatRetryDelay,
  formatTokenCount,
  formatTokenUsage,
  LANDING_IMAGE_MODEL_OPTIONS,
  LANDING_MODEL_OPTIONS,
  LANDING_VISION_MODEL_OPTIONS,
  resolveLandingModels,
} from '@workspace/prompt-panel'
