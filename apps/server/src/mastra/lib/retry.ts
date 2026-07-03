import {
  isBadRequestError,
  isRetryableOpenAIResponsesStreamError,
  type ProcessAPIErrorArgs,
  type ProcessAPIErrorResult,
  type Processor,
} from '@mastra/core/processors'

import type { Config } from '../../config-env.ts'

export interface LandingAgentRetryEvent {
  attempt: number
  delayMs: number
  issue: string
  maxAttempts: number
  reason: string
}

export type OnLandingAgentRetry = (event: LandingAgentRetryEvent) => void

type AgentRetryConfig = Config['agentRetry']

interface RetryPolicy {
  match: (error: unknown) => boolean
  maxRetries: number
  reason: string
}

const TRANSIENT_NETWORK_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENETRESET',
  'ENETUNREACH',
  'EPIPE',
  'ETIMEDOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
])

const TRANSIENT_NETWORK_MESSAGE =
  /\b(econnreset|econnrefused|etimedout|epipe|socket hang up|fetch failed|network error|connection reset|connection terminated|connect timeout|headers timeout|body timeout)\b/i

class LandingAgentRetryProcessor implements Processor<'landing-agent-retry-processor'> {
  readonly id = 'landing-agent-retry-processor'
  readonly name = 'Landing Agent Retry Reporter'

  readonly #onRetry?: OnLandingAgentRetry
  readonly #retry: AgentRetryConfig

  constructor(retry: AgentRetryConfig, onRetry?: OnLandingAgentRetry) {
    this.#onRetry = onRetry
    this.#retry = retry
  }

  async processAPIError(
    args: ProcessAPIErrorArgs,
  ): Promise<ProcessAPIErrorResult | void> {
    const policy = this.#findPolicy(args.error)
    if (!policy) return
    if (args.retryCount >= policy.maxRetries) return

    const delayMs = landingAgentRetryDelayMs(args.retryCount, this.#retry)
    this.#onRetry?.({
      attempt: args.retryCount + 1,
      delayMs,
      issue: summarizeRetryIssue(args.error),
      maxAttempts: policy.maxRetries,
      reason: policy.reason,
    })

    await waitDelay(delayMs, args.abortSignal)
    return { retry: true }
  }

  #findPolicy(error: unknown): RetryPolicy | undefined {
    const policies: RetryPolicy[] = [
      {
        match: hasRetryableProviderMetadata,
        maxRetries: this.#retry.streamErrorMaxRetries,
        reason: 'Provider marked the error as retryable',
      },
      {
        match: isTransientNetworkError,
        maxRetries: this.#retry.streamErrorMaxRetries,
        reason: 'Transient network issue',
      },
      {
        match: isRetryableOpenAIResponsesStreamError,
        maxRetries: this.#retry.streamErrorMaxRetries,
        reason: 'Retryable model stream error',
      },
      {
        match: isBadRequestError,
        maxRetries: Math.min(this.#retry.streamErrorMaxRetries, 1),
        reason: 'Transient bad request from provider',
      },
    ]

    return findPolicyInCauseChain(error, policies)
  }
}

export function createLandingAgentErrorProcessors(
  retry: AgentRetryConfig,
  onRetry?: OnLandingAgentRetry,
) {
  return [new LandingAgentRetryProcessor(retry, onRetry)]
}

export function isTransientNetworkError(error: unknown): boolean {
  const visited = new Set<object>()
  let current = error

  while (current && typeof current === 'object') {
    if (visited.has(current)) return false
    visited.add(current)

    if (isTransientNetworkErrorNode(current)) return true
    current = (current as { cause?: unknown }).cause
  }

  return typeof current === 'string' && TRANSIENT_NETWORK_MESSAGE.test(current)
}

export function landingAgentRetryDelayMs(
  retryCount: number,
  retry: Pick<AgentRetryConfig, 'retryBaseDelayMs' | 'retryMaxDelayMs'>,
) {
  const delay = retry.retryBaseDelayMs * 2 ** retryCount
  return Math.min(delay, retry.retryMaxDelayMs)
}

export function summarizeRetryIssue(error: unknown) {
  const parts: string[] = []
  const visited = new Set<object>()
  let current = error

  while (current && typeof current === 'object') {
    if (visited.has(current)) break
    visited.add(current)

    const status =
      numberProperty(current, 'statusCode') ?? numberProperty(current, 'status')
    const code = stringProperty(current, 'code')
    const message =
      current instanceof Error
        ? current.message
        : stringProperty(current, 'message')

    if (status) parts.push(`HTTP ${status}`)
    if (code) parts.push(code)
    if (message) parts.push(message)

    current = (current as { cause?: unknown }).cause
  }

  if (typeof current === 'string') parts.push(current)

  return (
    firstUsefulIssue(parts) ?? 'The model request failed before it completed.'
  )
}

function findPolicyInCauseChain(error: unknown, policies: RetryPolicy[]) {
  const visited = new Set<object>()
  let current = error

  while (current && typeof current === 'object') {
    if (visited.has(current)) return undefined
    visited.add(current)

    const policy = policies.find(({ match }) => match(current))
    if (policy) return policy
    current = (current as { cause?: unknown }).cause
  }

  return policies.find(({ match }) => match(current))
}

function firstUsefulIssue(parts: string[]) {
  const seen = new Set<string>()
  return parts.find((part) => {
    const normalized = part.trim()
    if (!normalized || seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}

function hasRetryableProviderMetadata(error: unknown) {
  return (
    Boolean(error) &&
    typeof error === 'object' &&
    (error as { isRetryable?: unknown }).isRetryable === true
  )
}

function isTransientNetworkErrorNode(error: object) {
  const code = stringProperty(error, 'code')?.toUpperCase()
  if (code && TRANSIENT_NETWORK_ERROR_CODES.has(code)) return true

  const name = stringProperty(error, 'name')
  if (name && TRANSIENT_NETWORK_MESSAGE.test(name)) return true

  const message =
    error instanceof Error ? error.message : stringProperty(error, 'message')
  return Boolean(message && TRANSIENT_NETWORK_MESSAGE.test(message))
}

function numberProperty(object: object, key: string) {
  const value = (object as Record<string, unknown>)[key]
  return typeof value === 'number' ? value : undefined
}

function stringProperty(object: object, key: string) {
  const value = (object as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}

async function waitDelay(delayMs: number, abortSignal?: AbortSignal) {
  if (delayMs <= 0) return

  await new Promise<void>((resolve) => {
    let timeout: ReturnType<typeof setTimeout> | undefined
    const onAbort = () => {
      if (timeout) clearTimeout(timeout)
      abortSignal?.removeEventListener('abort', onAbort)
      resolve()
    }

    abortSignal?.addEventListener('abort', onAbort, { once: true })
    if (abortSignal?.aborted) {
      onAbort()
      return
    }

    timeout = setTimeout(() => {
      abortSignal?.removeEventListener('abort', onAbort)
      resolve()
    }, delayMs)
  })
}
