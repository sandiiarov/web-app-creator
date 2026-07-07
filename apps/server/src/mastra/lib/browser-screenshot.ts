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
  projectId: string
  reject: (error: Error) => void
  resolve: (result: BrowserScreenshotResult) => void
  timeout: NodeJS.Timeout
}

const pendingScreenshots = new Map<string, PendingBrowserScreenshot>()

export function createPendingBrowserScreenshot({
  projectId,
  timeoutMs,
}: {
  projectId: string
  timeoutMs: number
}): { promise: Promise<BrowserScreenshotResult>; requestId: string } {
  const requestId = randomUUID()
  const promise = new Promise<BrowserScreenshotResult>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingScreenshots.delete(requestId)
      reject(new Error('Browser screenshot response timed out.'))
    }, timeoutMs)

    pendingScreenshots.set(requestId, { projectId, reject, resolve, timeout })
  })

  return { promise, requestId }
}

export function pendingBrowserScreenshotCount(): number {
  return pendingScreenshots.size
}

/** Reject a pending screenshot and return its project id (so the caller can
 *  record the inbound failure), or null if not found. */
export function rejectPendingBrowserScreenshot(
  requestId: string,
  reason: string,
): null | string {
  const pending = pendingScreenshots.get(requestId)
  if (!pending) return null

  pendingScreenshots.delete(requestId)
  clearTimeout(pending.timeout)
  pending.reject(new Error(reason))
  return pending.projectId
}

/** Resolve a pending screenshot and return its project id (so the caller can
 *  persist the bytes + record the inbound response), or null if not found. */
export function resolvePendingBrowserScreenshot(
  requestId: string,
  result: BrowserScreenshotResult,
): null | string {
  const pending = pendingScreenshots.get(requestId)
  if (!pending) return null

  pendingScreenshots.delete(requestId)
  clearTimeout(pending.timeout)
  pending.resolve(result)
  return pending.projectId
}
