import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { deleteProject } from './mastra/lib/project-store.ts'

const PROJECT_ID = '11111111-1111-1111-1111-111111111111'
const SCREENSHOT = {
  dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
  height: 900,
  mediaType: 'image/jpeg' as const,
  width: 1440,
}

afterEach(async () => {
  await deleteProject(PROJECT_ID)
  vi.doUnmock('./mastra/index.ts')
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('POST /api/screenshot-responses/:requestId', () => {
  it('resolves a pending browser screenshot response', async () => {
    await withServer(async ({ baseUrl, createPendingBrowserScreenshot }) => {
      const { promise, requestId } = createPendingBrowserScreenshot({
        projectId: PROJECT_ID,
        timeoutMs: 1_000,
      })

      const response = await fetch(
        `${baseUrl}/api/screenshot-responses/${requestId}`,
        {
          body: JSON.stringify(SCREENSHOT),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        },
      )

      await expect(response.json()).resolves.toEqual({ ok: true })
      await expect(promise).resolves.toEqual(SCREENSHOT)
    })
  })

  it('persists the screenshot bytes and serves them back under /screenshots/', async () => {
    await withServer(async ({ baseUrl, createPendingBrowserScreenshot }) => {
      const { requestId } = createPendingBrowserScreenshot({
        projectId: PROJECT_ID,
        timeoutMs: 1_000,
      })

      const post = await fetch(
        `${baseUrl}/api/screenshot-responses/${requestId}`,
        {
          body: JSON.stringify(SCREENSHOT),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        },
      )
      await expect(post.json()).resolves.toEqual({ ok: true })

      const fileName = `001-${requestId}.jpg`
      const get = await fetch(
        `${baseUrl}/api/projects/${PROJECT_ID}/screenshots/${fileName}`,
      )

      expect(get.status).toBe(200)
      expect(get.headers.get('content-type')).toBe('image/jpeg')
      const expected = Buffer.from('/9j/4AAQSkZJRg==', 'base64')
      expect(new Uint8Array(await get.arrayBuffer())).toEqual(
        new Uint8Array(expected),
      )
    })
  })

  it('returns 404 for an unknown screenshot file name', async () => {
    await withServer(async ({ baseUrl, createPendingBrowserScreenshot }) => {
      const { requestId } = createPendingBrowserScreenshot({
        projectId: PROJECT_ID,
        timeoutMs: 1_000,
      })

      await fetch(`${baseUrl}/api/screenshot-responses/${requestId}`, {
        body: JSON.stringify(SCREENSHOT),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })

      const get = await fetch(
        `${baseUrl}/api/projects/${PROJECT_ID}/screenshots/999-${requestId}.jpg`,
      )
      expect(get.status).toBe(404)
    })
  })

  it('rejects a pending browser screenshot response when the client reports an error', async () => {
    await withServer(async ({ baseUrl, createPendingBrowserScreenshot }) => {
      const { promise, requestId } = createPendingBrowserScreenshot({
        projectId: PROJECT_ID,
        timeoutMs: 1_000,
      })
      const rejection = promise.catch((error: unknown) => error)

      const response = await fetch(
        `${baseUrl}/api/screenshot-responses/${requestId}`,
        {
          body: JSON.stringify({ error: 'snapdom failed' }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        },
      )

      await expect(response.json()).resolves.toEqual({ ok: true })
      await expect(rejection).resolves.toMatchObject({
        message: 'snapdom failed',
      })
    })
  })

  it('returns 404 for unknown screenshot request ids', async () => {
    await withServer(async ({ baseUrl }) => {
      const response = await fetch(
        `${baseUrl}/api/screenshot-responses/00000000-0000-0000-0000-000000000000`,
        {
          body: JSON.stringify(SCREENSHOT),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        },
      )

      expect(response.status).toBe(404)
      await expect(response.json()).resolves.toMatchObject({ ok: false })
    })
  })
})

async function close(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error?: Error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

async function listen(server: Server) {
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve())
  })
}

async function withServer(
  fn: (context: {
    baseUrl: string
    createPendingBrowserScreenshot: typeof import('./mastra/lib/browser-screenshot.ts').createPendingBrowserScreenshot
  }) => Promise<void>,
) {
  vi.resetModules()
  vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
  vi.doMock('./mastra/index.ts', () => ({ mastra: {} }))
  const [{ server }, { createPendingBrowserScreenshot }] = await Promise.all([
    import('./index.ts'),
    import('./mastra/lib/browser-screenshot.ts'),
  ])

  await listen(server)
  const { port } = server.address() as AddressInfo

  try {
    await fn({
      baseUrl: `http://127.0.0.1:${port}`,
      createPendingBrowserScreenshot,
    })
  } finally {
    await close(server)
  }
}
