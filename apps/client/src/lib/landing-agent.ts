import type { ScreenshotViewportSize } from '@workspace/landing-preview'

export const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'

export const LANDING_AGENT_API = `${SERVER_URL}/agent`

// ── SSE event payloads (server → client) ──────────────────────────
//
// Wire types for the custom SSE stream. The domain/conversation model they
// build into lives in @workspace/prompt-panel.

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

export type ScreenshotRequestEvent = {
  projectId: string
  requestId: string
  selector: string
  viewportSize: ScreenshotViewportSize
}

export type { ScreenshotResponseInput } from '@workspace/landing-preview'
