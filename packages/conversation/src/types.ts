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
  mediaType?: string
  name: string
  screenshotHeight?: number
  screenshotWidth?: number
  selector?: string
  size?: number
}

/** Observational Memory cycle marker (context autocompaction). Emitted live
 *  by the server when the Observer/Reflector compresses history, persisted to
 *  the client log, and re-rendered on reload like any other turn part. */
export interface ConversationMemoryPart {
  /** Terminal duration in ms (derived from startedAt at done/error). */
  durationMs?: number
  error?: string
  id: string
  observationTokens?: number
  operation: 'observation' | 'reflection'
  /** Epoch ms when the cycle started running. */
  startedAt?: number
  state: 'done' | 'error' | 'running'
  tokensObserved?: number
  type: 'memory'
}

export type ConversationPart =
  | ConversationMemoryPart
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
  /** Set when the part stops being the streaming tail (next part or done). */
  durationMs?: number
  id: string
  /** Epoch ms of the first delta. */
  startedAt?: number
  text: string
  type: 'text'
}

export interface ConversationThinkingPart {
  /** Set when the part stops being the streaming tail (next part or done). */
  durationMs?: number
  id: string
  /** Epoch ms of the first delta. */
  startedAt?: number
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
  /** Terminal duration in ms (server-reported, or derived from startedAt). */
  durationMs?: number
  id: string
  images?: ConversationToolCallImage[]
  providerId?: string
  result?: null | string
  /** Epoch ms when the tool started running. */
  startedAt?: number
  state: ToolCallState
  tool: string
  type: 'tool_call'
}

export interface ConversationTurn {
  attachments?: ConversationAttachment[]
  /** Terminal turn duration in ms (done/error time − startedAt). */
  durationMs?: number
  error?: string
  htmlSwaps: number
  id: string
  isStreaming: boolean
  model: string
  parts: ConversationPart[]
  prompt: string
  /** Epoch ms when the prompt was sent (logged event ts). */
  startedAt?: number
  stopped?: boolean
}

export interface RunAcceptedAttachment {
  assetPath?: string
  byteLength?: number
  kind: 'element' | 'image'
  mediaType?: string
  name: string
  selector?: string
  sha256?: string
}

export interface RunAcceptedClientEvent extends ClientEvent {
  attachments: RunAcceptedAttachment[]
  compactionPercent: null | number
  dir: 'in'
  imageModel: string
  lifecycle: 'run_accepted'
  model: string
  prompt: string
  requestDigest: string
  requestVersion: 1
  turnId: string
  type: 'prompt'
  visionModel: string
}

export interface RunBlockedPayload {
  knownUsage: null | Record<string, unknown>
  reason: string
  turnId: string
}

export type RunTerminalOutcome =
  | 'completed'
  | 'error'
  | 'interrupted'
  | 'stopped'

export interface RunTerminalPayload {
  finishedAt: string
  outcome: RunTerminalOutcome
  reason?: string
  stats: null | Record<string, unknown>
  turnId: string
}

export type ToolCallState = 'done' | 'error' | 'running' | 'start'
