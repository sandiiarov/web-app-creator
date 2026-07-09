/**
 * Bounded OpenRouter vision/chat fetch: AbortController timeout + retry on
 * transient failures. Extracted to its own module so the export has a clear
 * production consumer (image-ocr.ts) and is directly unit-testable.
 */

const OCR_TIMEOUT_MS = 30_000
const OCR_MAX_ATTEMPTS = 3
const OCR_RETRY_BASE_DELAY_MS = 500

export interface VisionFetchOptions {
  baseDelayMs?: number
  maxAttempts?: number
  timeoutMs?: number
}

export type VisionFetchResult =
  | { ok: false; reason: string }
  | { ok: true; response: Response }

/**
 * POST to an OpenRouter chat endpoint with a bounded timeout and retry on
 * transient failures (AbortError/timeout, 5xx). 4xx responses are returned
 * immediately so the caller surfaces the provider error verbatim. On
 * retry-exhaustion a 5xx response is still returned (caller reads the body).
 */
export async function fetchVisionCompletion(
  url: string,
  init: RequestInit,
  options: VisionFetchOptions = {},
): Promise<VisionFetchResult> {
  const timeoutMs = options.timeoutMs ?? OCR_TIMEOUT_MS
  const maxAttempts = options.maxAttempts ?? OCR_MAX_ATTEMPTS
  const baseDelayMs = options.baseDelayMs ?? OCR_RETRY_BASE_DELAY_MS

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
          ? `OpenRouter vision timed out after ${maxAttempts} attempts (${timeoutMs / 1000}s each)`
          : `OpenRouter vision fetch failed after ${maxAttempts} attempts: ${errorMessage(error)}`,
      }
    }
    clearTimeout(timer)
    if (response.status >= 500 && attempt < maxAttempts) {
      await retryDelay(baseDelayMs, attempt)
      continue
    }
    return { ok: true, response }
  }
  return { ok: false, reason: 'OpenRouter vision request failed' }
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
