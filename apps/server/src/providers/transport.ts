import {
  OperationDeadlineError,
  type OperationContext,
} from './operation-scope.ts'

export const PROVIDER_JSON_MAX_BYTES = 16 * 1024 * 1024
export const IMAGE_GENERATION_JSON_MAX_BYTES = 48 * 1024 * 1024
export const PROVIDER_BINARY_MAX_BYTES = 32 * 1024 * 1024
export const PROVIDER_ERROR_MAX_BYTES = 64 * 1024

export interface ProviderRequestOptions {
  baseDelayMs?: number
  init?: RequestInit
  label: string
  maxAttempts?: number
  maxBytes?: number
  operation: OperationContext
  retry: 'paid' | 'safe'
  url: string
}

export interface ProviderTransport {
  bytes(
    options: ProviderRequestOptions,
  ): Promise<ProviderTransportResult<Uint8Array>>
  json<T = unknown>(
    options: ProviderRequestOptions,
  ): Promise<ProviderTransportResult<T>>
  text(
    options: ProviderRequestOptions,
  ): Promise<ProviderTransportResult<string>>
}

export type ProviderTransportErrorCode =
  | 'ambiguous_paid_outcome'
  | 'cancelled'
  | 'http'
  | 'invalid_body'
  | 'network'
  | 'timed_out'
  | 'too_large'

export type ProviderTransportResult<T> =
  | { error: ProviderTransportError; ok: false }
  | { headers: Headers; ok: true; status: number; value: T }

export class ProviderTransportError extends Error {
  readonly code: ProviderTransportErrorCode
  readonly remoteOutcome: 'not_accepted' | 'unknown'
  readonly status?: number

  constructor({
    cause,
    code,
    message,
    remoteOutcome = 'not_accepted',
    status,
  }: {
    cause?: unknown
    code: ProviderTransportErrorCode
    message: string
    remoteOutcome?: 'not_accepted' | 'unknown'
    status?: number
  }) {
    super(message, { cause })
    this.code = code
    this.name = 'ProviderTransportError'
    this.remoteOutcome = remoteOutcome
    this.status = status
  }
}

/**
 * Owns provider response bodies through completion. Safe reads may retry a
 * transient failure within the operation deadline. Paid requests never retry:
 * a network failure after dispatch has an unknown provider outcome, and this
 * application has no endpoint-specific idempotency guarantee to prevent a
 * duplicate charge.
 */
export function createProviderTransport({
  fetch: fetchImplementation = ((input, init) =>
    globalThis.fetch(input, init)) as typeof fetch,
}: {
  fetch?: typeof fetch
} = {}): ProviderTransport {
  async function requestBytes(
    options: ProviderRequestOptions,
  ): Promise<ProviderTransportResult<Uint8Array>> {
    const maxAttempts =
      options.retry === 'paid' ? 1 : (options.maxAttempts ?? 3)
    const maxBytes = options.maxBytes ?? PROVIDER_JSON_MAX_BYTES
    const baseDelayMs = options.baseDelayMs ?? 500
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const signal = options.init?.signal
        ? AbortSignal.any([options.operation.signal, options.init.signal])
        : options.operation.signal
      try {
        assertRequestActive(options.operation, signal)
      } catch (error) {
        return { error: transportFailure(options, signal, error), ok: false }
      }
      let response: Response
      try {
        response = await fetchImplementation(options.url, {
          ...options.init,
          signal,
        })
      } catch (error) {
        const failure = transportFailure(options, signal, error)
        if (
          options.retry === 'safe' &&
          failure.code === 'network' &&
          attempt < maxAttempts
        ) {
          const delayed = await retryDelay(
            baseDelayMs,
            attempt,
            options.operation,
            signal,
          )
          if (!delayed.ok) return delayed
          continue
        }
        return { error: failure, ok: false }
      }
      try {
        assertRequestActive(options.operation, signal)
      } catch (error) {
        await cancelBody(response.body, signal.reason)
        return { error: transportFailure(options, signal, error), ok: false }
      }

      const body = await readBody(
        response,
        response.ok ? maxBytes : PROVIDER_ERROR_MAX_BYTES,
        options,
        signal,
      )
      if (!body.ok) {
        if (
          options.retry === 'safe' &&
          body.error.code === 'network' &&
          attempt < maxAttempts
        ) {
          const delayed = await retryDelay(
            baseDelayMs,
            attempt,
            options.operation,
            signal,
          )
          if (!delayed.ok) return delayed
          continue
        }
        return body
      }

      if (!response.ok) {
        const detail = new TextDecoder().decode(body.value).trim()
        if (
          options.retry === 'safe' &&
          response.status >= 500 &&
          attempt < maxAttempts
        ) {
          const delayed = await retryDelay(
            baseDelayMs,
            attempt,
            options.operation,
            signal,
          )
          if (!delayed.ok) return delayed
          continue
        }
        return {
          error: new ProviderTransportError({
            code: 'http',
            message: `${options.label} failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
            remoteOutcome:
              options.retry === 'paid' ? 'unknown' : 'not_accepted',
            status: response.status,
          }),
          ok: false,
        }
      }

      return {
        headers: response.headers,
        ok: true,
        status: response.status,
        value: body.value,
      }
    }
    return {
      error: new ProviderTransportError({
        code: 'network',
        message: `${options.label} failed after all attempts.`,
      }),
      ok: false,
    }
  }

  return {
    bytes(options) {
      return requestBytes({
        ...options,
        maxBytes: options.maxBytes ?? PROVIDER_BINARY_MAX_BYTES,
      })
    },
    async json<T>(options: ProviderRequestOptions) {
      const result = await requestBytes(options)
      if (!result.ok) return result
      try {
        const parsed = {
          ...result,
          value: JSON.parse(new TextDecoder().decode(result.value)) as T,
        }
        assertRequestActive(
          options.operation,
          options.init?.signal
            ? AbortSignal.any([options.operation.signal, options.init.signal])
            : options.operation.signal,
        )
        return parsed
      } catch (error) {
        const signal = options.init?.signal
          ? AbortSignal.any([options.operation.signal, options.init.signal])
          : options.operation.signal
        if (signal.aborted || options.operation.signal.aborted) {
          return {
            error: transportFailure(options, signal, error),
            ok: false,
          }
        }
        return {
          error: new ProviderTransportError({
            cause: error,
            code: 'invalid_body',
            message: `${options.label} returned invalid JSON.`,
            remoteOutcome:
              options.retry === 'paid' ? 'unknown' : 'not_accepted',
          }),
          ok: false,
        }
      }
    },
    async text(options) {
      const result = await requestBytes(options)
      if (!result.ok) return result
      const value = new TextDecoder().decode(result.value)
      const signal = options.init?.signal
        ? AbortSignal.any([options.operation.signal, options.init.signal])
        : options.operation.signal
      try {
        assertRequestActive(options.operation, signal)
        return { ...result, value }
      } catch (error) {
        return { error: transportFailure(options, signal, error), ok: false }
      }
    },
  }
}

function assertRequestActive(
  operation: OperationContext,
  signal: AbortSignal,
): void {
  operation.assertActive()
  signal.throwIfAborted()
}

async function cancelBody(
  body: null | ReadableStream<Uint8Array>,
  reason: unknown,
): Promise<void> {
  if (!body) return
  try {
    await body.cancel(reason)
  } catch {
    // Preserve the classified transport failure.
  }
}

async function readBody(
  response: Response,
  maxBytes: number,
  options: ProviderRequestOptions,
  signal: AbortSignal,
): Promise<ProviderTransportResult<Uint8Array>> {
  try {
    assertRequestActive(options.operation, signal)
  } catch (error) {
    await cancelBody(response.body, signal.reason)
    return { error: transportFailure(options, signal, error), ok: false }
  }
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await cancelBody(
      response.body,
      'Response body exceeds the configured limit.',
    )
    return tooLarge(options, maxBytes)
  }
  if (!response.body) {
    return {
      headers: response.headers,
      ok: true,
      status: response.status,
      value: new Uint8Array(),
    }
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let byteLength = 0
  let cancellation: Promise<unknown> | undefined
  const onAbort = () => {
    cancellation ??= reader.cancel(signal.reason).catch(() => {})
  }
  signal.addEventListener('abort', onAbort, { once: true })
  if (signal.aborted) onAbort()
  try {
    for (;;) {
      const next = await reader.read()
      assertRequestActive(options.operation, signal)
      if (next.done) break
      byteLength += next.value.byteLength
      if (byteLength > maxBytes) {
        await reader.cancel('Response body exceeds the configured limit.')
        return tooLarge(options, maxBytes)
      }
      chunks.push(next.value)
    }
  } catch (error) {
    return { error: transportFailure(options, signal, error), ok: false }
  } finally {
    signal.removeEventListener('abort', onAbort)
    if (cancellation) await cancellation
    reader.releaseLock()
  }

  const value = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    value.set(chunk, offset)
    offset += chunk.byteLength
  }
  return {
    headers: response.headers,
    ok: true,
    status: response.status,
    value,
  }
}

async function retryDelay(
  baseDelayMs: number,
  attempt: number,
  operation: OperationContext,
  signal: AbortSignal,
): Promise<{ error: ProviderTransportError; ok: false } | { ok: true }> {
  const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), baseDelayMs * 4)
  try {
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer)
        reject(signal.reason)
      }
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort)
        resolve()
      }, delay)
      signal.addEventListener('abort', onAbort, { once: true })
      if (signal.aborted) onAbort()
    })
    assertRequestActive(operation, signal)
    return { ok: true }
  } catch (error) {
    return {
      error: transportFailure(
        {
          label: 'Provider retry delay',
          operation,
          retry: 'safe',
          url: '',
        },
        signal,
        error,
      ),
      ok: false,
    }
  }
}

function tooLarge(
  options: ProviderRequestOptions,
  maxBytes: number,
): { error: ProviderTransportError; ok: false } {
  return {
    error: new ProviderTransportError({
      code: 'too_large',
      message: `${options.label} exceeded the ${maxBytes}-byte response limit.`,
      remoteOutcome: options.retry === 'paid' ? 'unknown' : 'not_accepted',
    }),
    ok: false,
  }
}

function transportFailure(
  options: ProviderRequestOptions,
  signal: AbortSignal,
  error: unknown,
): ProviderTransportError {
  const reason = signal.reason ?? options.operation.signal.reason
  if (reason instanceof OperationDeadlineError) {
    return new ProviderTransportError({
      cause: error,
      code: 'timed_out',
      message: `${options.label} timed out.`,
      remoteOutcome: options.retry === 'paid' ? 'unknown' : 'not_accepted',
    })
  }
  if (signal.aborted || options.operation.signal.aborted) {
    return new ProviderTransportError({
      cause: error,
      code: 'cancelled',
      message: `${options.label} was cancelled.`,
      remoteOutcome: options.retry === 'paid' ? 'unknown' : 'not_accepted',
    })
  }
  if (options.retry === 'paid') {
    return new ProviderTransportError({
      cause: error,
      code: 'ambiguous_paid_outcome',
      message: `${options.label} failed after dispatch; provider outcome is unknown.`,
      remoteOutcome: 'unknown',
    })
  }
  return new ProviderTransportError({
    cause: error,
    code: 'network',
    message: `${options.label} network request failed.`,
  })
}
