import { randomUUID } from 'node:crypto'

export type BrowserScreenshotMediaType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'

export interface BrowserScreenshotResult {
  dataUrl: string
  height: number
  mediaType: BrowserScreenshotMediaType
  width: number
}

interface PendingBrowserScreenshot {
  reject: (error: Error) => void
  resolve: (result: BrowserScreenshotResult) => void
  timeout: NodeJS.Timeout
}

const pendingScreenshots = new Map<string, PendingBrowserScreenshot>()

export function createPendingBrowserScreenshot({
  timeoutMs,
}: {
  timeoutMs: number
}): { promise: Promise<BrowserScreenshotResult>; requestId: string } {
  const requestId = randomUUID()
  const promise = new Promise<BrowserScreenshotResult>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingScreenshots.delete(requestId)
      reject(new Error('Browser screenshot response timed out.'))
    }, timeoutMs)

    pendingScreenshots.set(requestId, { reject, resolve, timeout })
  })

  return { promise, requestId }
}

export function pendingBrowserScreenshotCount(): number {
  return pendingScreenshots.size
}

export function rejectPendingBrowserScreenshot(
  requestId: string,
  reason: string,
): boolean {
  const pending = pendingScreenshots.get(requestId)
  if (!pending) return false

  pendingScreenshots.delete(requestId)
  clearTimeout(pending.timeout)
  pending.reject(new Error(reason))
  return true
}

export function resolvePendingBrowserScreenshot(
  requestId: string,
  result: BrowserScreenshotResult,
): boolean {
  const pending = pendingScreenshots.get(requestId)
  if (!pending) return false

  pendingScreenshots.delete(requestId)
  clearTimeout(pending.timeout)
  pending.resolve(result)
  return true
}
