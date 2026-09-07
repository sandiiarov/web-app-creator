import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createApiServer } from './index.ts'
import type { ServerRuntime } from './runtime.ts'
import { allowNetworkOrigin } from './testing/deny-network.ts'
import { createRuntimeFixture } from './testing/runtime-fixture.ts'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('GET /api/projects/:id/html', () => {
  it('returns 404 for a project with no generated HTML', async () => {
    await withServer(async ({ baseUrl, runtime }) => {
      const project = await runtime.repository.createProject({})

      const response = await fetch(`${baseUrl}/api/projects/${project.id}/html`)
      expect(response.status).toBe(404)
    })
  })

  it('serves the rendered HTML as a downloadable attachment', async () => {
    await withServer(async ({ baseUrl, runtime }) => {
      const project = await runtime.repository.createProject({})
      runtime.repository
        .createProjectHtmlStore(project.id)
        .set('<html><body><h1>Hi</h1></body></html>')

      const response = await fetch(`${baseUrl}/api/projects/${project.id}/html`)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe(
        'text/html; charset=utf-8',
      )
      expect(response.headers.get('content-disposition')).toMatch(
        /attachment; filename=".+\.html"/,
      )
      expect(await response.text()).toContain('<h1>Hi</h1>')
    })
  })

  it('inlines referenced project images as base64 data URLs', async () => {
    await withServer(async ({ baseUrl, runtime }) => {
      const project = await runtime.repository.createProject({
        title: 'Cafe Landing',
      })
      const imgId = runtime.imageStore.saveImage(
        Buffer.from('fake-jpeg-bytes'),
        'image/jpeg',
      )
      const imgUrl = runtime.repository.persistGeneratedImage(
        project.id,
        imgId,
        '.jpg',
      )
      if (!imgUrl) throw new Error('failed to seed project image')
      runtime.repository
        .createProjectHtmlStore(project.id)
        .set(`<html><body><img src="${imgUrl}"></body></html>`)

      const response = await fetch(`${baseUrl}/api/projects/${project.id}/html`)
      expect(response.status).toBe(200)
      const body = await response.text()
      expect(body).toContain('data:image/jpeg;base64,')
      expect(body).not.toContain('/api/projects/')
      expect(response.headers.get('content-disposition')).toMatch(
        /filename="cafe-landing\.html"/,
      )
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
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error)
    server.once('error', onError)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', onError)
      resolve()
    })
  })
}

async function withServer(
  fn: (context: { baseUrl: string; runtime: ServerRuntime }) => Promise<void>,
) {
  vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
  const fixture = await createRuntimeFixture()
  const server = createApiServer(fixture.runtime)
  let disallow: (() => void) | undefined
  let listening = false
  try {
    await listen(server)
    listening = true
    const { port } = server.address() as AddressInfo
    disallow = allowNetworkOrigin(`http://127.0.0.1:${port}`)
    await fn({ baseUrl: `http://127.0.0.1:${port}`, runtime: fixture.runtime })
  } finally {
    disallow?.()
    try {
      if (listening) await close(server)
    } finally {
      await fixture.dispose()
    }
  }
}
