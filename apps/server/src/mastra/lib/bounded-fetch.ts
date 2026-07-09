/**
 * Bounded fetch: AbortController timeout + retry on transient failures. Shared
 * by every outbound OpenRouter / remote-host call (vision OCR, image
 * generation, scraped-image download) so a slow or hung endpoint fails fast
 * with a clear reason instead of hanging the agent stream. Directly
 * unit-testable; the call sites pass a `label` used in timeout/failure reasons.
 */

// Defaults for the helper. Call sites may override per-call (e.g. external
// image downloads use a shorter timeout and fewer retries than the paid API).
const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_RETRY_BASE_DELAY_MS = 500
const DEFAULT_LABEL = 'OpenRouter request'

export interface BoundedFetchOptions {
  baseDelayMs?: number
  /** Label used in timeout/failure reasons, e.g. "OpenRouter image generation". */
  label?: string
  maxAttempts?: number
  timeoutMs?: number
}

export type BoundedFetchResult =
  | { ok: false; reason: string }
  | { ok: true; response: Response }

/**
 * Fetch `url` with a bounded timeout and retry on transient failures
 * (AbortError/timeout, 5xx). 4xx responses are returned immediately so the
 * caller surfaces the provider error verbatim. On retry-exhaustion a 5xx
 * response is still returned (caller reads the body).
 */
export async function boundedFetch(
  url: string,
  init: RequestInit,
  options: BoundedFetchOptions = {},
): Promise<BoundedFetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS
  const label = options.label ?? DEFAULT_LABEL

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let response: Response
    try {
      response = await fetch(url, { ...init, signal: controller.signal })
    } catch (error) {
      clearTimeout(timer)
      if (attempt < maxAttempts) {
        await retryDelay(baseDelayMs, attempt)
        continue
      }
      return {
        ok: false,
        reason: isAbortError(error)
          ? `${label} timed out after ${maxAttempts} attempts (${timeoutMs / 1000}s each)`
          : `${label} fetch failed after ${maxAttempts} attempts: ${errorMessage(error)}`,
      }
    }
    clearTimeout(timer)
    if (response.status >= 500 && attempt < maxAttempts) {
      await retryDelay(baseDelayMs, attempt)
      continue
    }
    return { ok: true, response }
  }
  return { ok: false, reason: `${label} request failed` }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.name === 'AbortError' || /abort|timed\s*out/i.test(error.message)
}

function retryDelay(baseDelayMs: number, attempt: number): Promise<void> {
  const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), baseDelayMs * 4)
  return new Promise((resolve) => {
    setTimeout(resolve, delay)
  })
}
