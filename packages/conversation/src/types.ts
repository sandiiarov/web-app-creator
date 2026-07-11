/**
 * Canonical conversation model shared by the server (hydration/replay) and the
 * client (live SSE stream). The server's `ProjectMessageTurn`/`Part` and the
 * client's `LandingTurn`/`TurnPart` are aliases of these types, so the
 * event→turn reducer in `reducer.ts` is the single source of truth for how an
 * SSE event mutates a turn.
 */

/** One line of the client wire: a server→client SSE event (`out`) or an
 *  inbound client request (`in`). The reducer reads `dir`/`type`/`event`/
 *  `payload`/`turnId`/`model`/`prompt` off it. */
export type ClientEvent = Record<string, unknown> & {
  dir: 'in' | 'out'
  ts: string
}

export interface ConversationAttachment {
  analysisText?: string
  html?: string
  id: string
  kind?: 'element' | 'image'
  mediaType: string
  name: string
  screenshotHeight?: number
  screenshotWidth?: number
  selector?: string
  size: number
}

export type ConversationPart =
  | ConversationRetryPart
  | ConversationStatsPart
  | ConversationTextPart
  | ConversationThinkingPart
  | ConversationToolCallPart

/** Live-only retry indicator (client appends it during streaming; the server's
 *  hydration reducer intentionally skips `retry`, so these do not survive a
 *  reload — see `reducer.ts`). */
export interface ConversationRetryPart {
  attempt: number
  delayMs: number
  id: string
  issue: string
  maxAttempts: number
  reason: string
  startedAt: number
  type: 'retry'
}

export interface ConversationStatsPart {
  cost: number
  costBreakdown?: unknown
  durationMs: number
  finishReason: string
  model: string
  type: 'stats'
  usage: Record<string, number | undefined>
}

export interface ConversationTextPart {
  id: string
  text: string
  type: 'text'
}

export interface ConversationThinkingPart {
  id: string
  text: string
  type: 'thinking'
}

export interface ConversationToolCallImage {
  alt: string
  url: string
}

export interface ConversationToolCallPart {
  action: null | string
  detail?: null | string
  id: string
  images?: ConversationToolCallImage[]
  providerId?: string
  result?: null | string
  state: ToolCallState
  tool: string
  type: 'tool_call'
}

export interface ConversationTurn {
  attachments?: ConversationAttachment[]
  error?: string
  htmlSwaps: number
  id: string
  isStreaming: boolean
  model: string
  parts: ConversationPart[]
  prompt: string
  stopped?: boolean
}

export type ToolCallState = 'done' | 'error' | 'running' | 'start'
