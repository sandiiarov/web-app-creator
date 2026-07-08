import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { deleteProject } from './mastra/lib/project-store.ts'

const CREATED: string[] = []

afterEach(async () => {
  await Promise.all(CREATED.splice(0).map((id) => deleteProject(id)))
  vi.doUnmock('./mastra/index.ts')
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('GET /api/projects/:id/html', () => {
  it('returns 404 for a project with no generated HTML', async () => {
    await withServer(async ({ baseUrl }) => {
      const { createProject } = await import('./mastra/lib/project-store.ts')
      const project = await createProject({})
      CREATED.push(project.id)

      const response = await fetch(`${baseUrl}/api/projects/${project.id}/html`)
      expect(response.status).toBe(404)
    })
  })

  it('serves the rendered HTML as a downloadable attachment', async () => {
    await withServer(async ({ baseUrl }) => {
      const { createProject, createProjectHtmlStore } =
        await import('./mastra/lib/project-store.ts')
      const project = await createProject({})
      CREATED.push(project.id)
      createProjectHtmlStore(project.id).set(
        '<html><body><h1>Hi</h1></body></html>',
      )

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
    await withServer(async ({ baseUrl }) => {
      const { createProject, createProjectHtmlStore, persistGeneratedImage } =
        await import('./mastra/lib/project-store.ts')
      const { saveImage } = await import('./mastra/lib/image-store.ts')
      const project = await createProject({ title: 'Cafe Landing' })
      CREATED.push(project.id)

      const imgId = saveImage(Buffer.from('fake-jpeg-bytes'), 'image/jpeg')
      const imgUrl = persistGeneratedImage(project.id, imgId, '.jpg')
      if (!imgUrl) throw new Error('failed to seed project image')
      createProjectHtmlStore(project.id).set(
        `<html><body><img src="${imgUrl}"></body></html>`,
      )

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
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve())
  })
}

async function withServer(fn: (context: { baseUrl: string }) => Promise<void>) {
  vi.resetModules()
  vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
  vi.doMock('./mastra/index.ts', () => ({ mastra: {} }))
  const { server } = await import('./index.ts')
  await listen(server)
  const { port } = server.address() as AddressInfo
  try {
    await fn({ baseUrl: `http://127.0.0.1:${port}` })
  } finally {
    await close(server)
  }
}
