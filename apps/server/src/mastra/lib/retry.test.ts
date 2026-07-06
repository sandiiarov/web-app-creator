import { describe, expect, it } from 'vitest'

import {
  createLandingAgentErrorProcessors,
  isTransientNetworkError,
  landingAgentRetryDelayMs,
  summarizeRetryIssue,
} from './retry.ts'

const retryConfig = {
  modelMaxRetries: 0,
  retryBaseDelayMs: 1000,
  retryMaxDelayMs: 5000,
  streamErrorMaxRetries: 2,
} as const

describe('landing agent retry helpers', () => {
  it('calculates capped exponential retry delays', () => {
    expect(landingAgentRetryDelayMs(0, retryConfig)).toBe(1000)
    expect(landingAgentRetryDelayMs(1, retryConfig)).toBe(2000)
    expect(landingAgentRetryDelayMs(3, retryConfig)).toBe(5000)
  })

  it('matches transient network errors and their causes', () => {
    const cause = Object.assign(new Error('socket hang up'), {
      code: 'ECONNRESET',
    })
    const error = Object.assign(new Error('fetch failed'), { cause })

    expect(isTransientNetworkError(error)).toBe(true)
    expect(isTransientNetworkError('body timeout')).toBe(true)
    expect(isTransientNetworkError({ name: 'Headers Timeout' })).toBe(true)
    expect(isTransientNetworkError(new Error('schema validation failed'))).toBe(
      false,
    )

    const circular: { cause?: unknown; code: string } = { code: 'NOPE' }
    circular.cause = circular
    expect(isTransientNetworkError(circular)).toBe(false)
  })

  it('builds a capped retry processor that reports visible retry state', async () => {
    const retries: unknown[] = []
    const processors = createLandingAgentErrorProcessors(
      {
        ...retryConfig,
        retryBaseDelayMs: 0,
        retryMaxDelayMs: 0,
      },
      (event) => retries.push(event),
    )
    const processor = processors[0]!
    const error = Object.assign(new Error('socket hang up'), {
      code: 'ECONNRESET',
    })

    expect(processor.id).toBe('landing-agent-retry-processor')
    await expect(
      processor.processAPIError({ error, retryCount: 0 } as never),
    ).resolves.toEqual({ retry: true })
    expect(retries).toEqual([
      {
        attempt: 1,
        delayMs: 0,
        issue: 'ECONNRESET',
        maxAttempts: 2,
        reason: 'Transient network issue',
      },
    ])
    await expect(
      processor.processAPIError({ error, retryCount: 2 } as never),
    ).resolves.toBeUndefined()
  })

  it('retries provider-marked errors and resolves aborted waits', async () => {
    const controller = new AbortController()
    const retries: unknown[] = []
    const [processor] = createLandingAgentErrorProcessors(
      { ...retryConfig, retryBaseDelayMs: 100, retryMaxDelayMs: 100 },
      (event) => retries.push(event),
    )

    const promise = processor!.processAPIError({
      abortSignal: controller.signal,
      error: { isRetryable: true, message: 'try again' },
      retryCount: 0,
    } as never)
    controller.abort()

    await expect(promise).resolves.toEqual({ retry: true })
    expect(retries).toEqual([
      {
        attempt: 1,
        delayMs: 100,
        issue: 'try again',
        maxAttempts: 2,
        reason: 'Provider marked the error as retryable',
      },
    ])
  })

  it('summarizes retry issues from status, code, and message', () => {
    expect(
      summarizeRetryIssue({
        cause: new Error('socket hang up'),
        statusCode: 502,
      }),
    ).toBe('HTTP 502')
    expect(summarizeRetryIssue({ message: 'rate limited', status: 429 })).toBe(
      'HTTP 429',
    )
    expect(summarizeRetryIssue('')).toBe(
      'The model request failed before it completed.',
    )
  })
})
