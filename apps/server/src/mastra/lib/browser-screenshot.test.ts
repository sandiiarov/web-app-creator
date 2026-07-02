import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createPendingBrowserScreenshot,
  pendingBrowserScreenshotCount,
  rejectPendingBrowserScreenshot,
  resolvePendingBrowserScreenshot,
} from './browser-screenshot.ts'

const SCREENSHOT = {
  dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
  height: 900,
  mediaType: 'image/jpeg' as const,
  width: 1440,
}

afterEach(() => {
  vi.useRealTimers()
})

describe('browser screenshot registry', () => {
  it('resolves a pending screenshot request once', async () => {
    const { promise, requestId } = createPendingBrowserScreenshot({
      timeoutMs: 1_000,
    })

    expect(pendingBrowserScreenshotCount()).toBe(1)
    expect(resolvePendingBrowserScreenshot(requestId, SCREENSHOT)).toBe(true)
    await expect(promise).resolves.toEqual(SCREENSHOT)
    expect(resolvePendingBrowserScreenshot(requestId, SCREENSHOT)).toBe(false)
    expect(pendingBrowserScreenshotCount()).toBe(0)
  })

  it('rejects a pending screenshot request with a browser error', async () => {
    const { promise, requestId } = createPendingBrowserScreenshot({
      timeoutMs: 1_000,
    })

    const rejection = promise.catch((error: unknown) => error)

    expect(rejectPendingBrowserScreenshot(requestId, 'capture failed')).toBe(
      true,
    )
    await expect(rejection).resolves.toMatchObject({
      message: 'capture failed',
    })
    expect(rejectPendingBrowserScreenshot(requestId, 'capture failed')).toBe(
      false,
    )
    expect(pendingBrowserScreenshotCount()).toBe(0)
  })

  it('rejects and cleans up when a screenshot response times out', async () => {
    vi.useFakeTimers()
    const { promise } = createPendingBrowserScreenshot({ timeoutMs: 50 })
    const rejection = promise.catch((error: unknown) => error)

    await vi.advanceTimersByTimeAsync(50)

    await expect(rejection).resolves.toMatchObject({
      message: 'Browser screenshot response timed out.',
    })
    expect(pendingBrowserScreenshotCount()).toBe(0)
  })
})
