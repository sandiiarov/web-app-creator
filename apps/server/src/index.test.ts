import { readFile, rm } from 'node:fs/promises'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, it, vi } from 'vitest'

const IMAGE_ATTACHMENT = {
  dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
  id: 'image-1',
  mediaType: 'image/png',
  name: 'hero.png',
  size: 68,
}

const ELEMENT_ATTACHMENT = {
  ...IMAGE_ATTACHMENT,
  html: '<button>Buy</button>',
  id: 'element-1',
  kind: 'element',
  name: 'button.png',
  screenshotHeight: 120,
  screenshotWidth: 240,
  selector: 'button',
}

const SCREENSHOT = {
  dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
  height: 900,
  mediaType: 'image/jpeg',
  width: 1440,
}

const createdBenchmarkReportPaths: string[] = []
const createdProjectIds: string[] = []

afterEach(async () => {
  vi.doUnmock('./mastra/route.ts')
  vi.unstubAllEnvs()
  vi.resetModules()
  vi.restoreAllMocks()

  const { deleteProject } = await import('./mastra/lib/project-store.ts')
  await Promise.all(createdProjectIds.splice(0).map((id) => deleteProject(id)))
  await Promise.all(
    createdBenchmarkReportPaths
      .splice(0)
      .map((path) => rm(path, { force: true })),
  )
})

describe('server HTTP routes', () => {
  it('handles CORS preflight and not found responses', async () => {
    await withServer(async ({ baseUrl }) => {
      const options = await fetch(`${baseUrl}/agent`, { method: 'OPTIONS' })
      expect(options.status).toBe(204)
      expect(options.headers.get('access-control-allow-origin')).toBe(
        'https://client.test',
      )
      expect(options.headers.get('access-control-allow-methods')).toBe(
        'DELETE,GET,PATCH,POST,OPTIONS',
      )

      const missing = await fetch(`${baseUrl}/missing`)
      expect(missing.status).toBe(404)
      await expect(missing.json()).resolves.toEqual({
        error: 'Not found',
        ok: false,
      })
    })
  })

  it('validates /agent request bodies before streaming', async () => {
    await withServer(async ({ baseUrl, streamLandingAgent }) => {
      const cases = [
        [{ projectId: 'project-1', prompt: '' }, 'Expected { prompt: string }'],
        [{ prompt: 'Build' }, 'Expected { projectId: string }'],
        [
          { projectId: 'project-1', prompt: 'Build', textModel: '' },
          'Expected { textModel?: string }',
        ],
        [
          { imageModel: '', projectId: 'project-1', prompt: 'Build' },
          'Expected { imageModel?: string }',
        ],
        [
          { projectId: 'project-1', prompt: 'Build', visionModel: '' },
          'Expected { visionModel?: string }',
        ],
        [
          { attachments: {}, projectId: 'project-1', prompt: 'Build' },
          'Expected { attachments?: attachment[] }',
        ],
        [
          {
            attachments: Array.from({ length: 5 }, (_, index) => ({
              ...IMAGE_ATTACHMENT,
              id: `image-${index}`,
            })),
            projectId: 'project-1',
            prompt: 'Build',
          },
          'Attach up to 4 items.',
        ],
        [
          {
            attachments: [{ ...IMAGE_ATTACHMENT, mediaType: 'image/svg+xml' }],
            projectId: 'project-1',
            prompt: 'Build',
          },
          'Invalid attachment 1: expected PNG, JPEG, WEBP, or GIF mediaType.',
        ],
        [
          {
            attachments: [
              { ...IMAGE_ATTACHMENT, dataUrl: 'data:image/png;base64,' },
            ],
            projectId: 'project-1',
            prompt: 'Build',
          },
          'Invalid attachment 1: expected matching base64 dataUrl.',
        ],
        [
          {
            attachments: [{ ...ELEMENT_ATTACHMENT, screenshotWidth: 0 }],
            projectId: 'project-1',
            prompt: 'Build',
          },
          'Invalid attachment 1: expected screenshotWidth between 1 and 4096.',
        ],
      ] as const

      for (const [body, error] of cases) {
        const response = await postJson(`${baseUrl}/agent`, body)
        expect(response.status).toBe(400)
        await expect(response.json()).resolves.toEqual({ error, ok: false })
      }
      expect(streamLandingAgent).not.toHaveBeenCalled()
    })
  })

  it('streams valid /agent requests with normalized attachments and model ids', async () => {
    await withServer(async ({ baseUrl, streamLandingAgent }) => {
      const response = await postJson(`${baseUrl}/agent`, {
        attachments: [IMAGE_ATTACHMENT, ELEMENT_ATTACHMENT],
        imageModel: 'openrouter/bytedance-seed/seedream-4.5',
        projectId: 'project-1',
        prompt: 'Build a hero',
        textModel: 'custom-model',
        visionModel: 'openrouter/moonshotai/kimi-k2.7-code',
      })

      expect(response.status).toBe(200)
      await expect(response.text()).resolves.toBe('event: done\ndata: {}\n\n')
      const call = streamLandingAgent.mock.calls[0]?.[0]
      expect(call).toMatchObject({
        attachments: [
          expect.objectContaining({ name: 'hero.png' }),
          expect.objectContaining({
            html: '<button>Buy</button>',
            kind: 'element',
            mediaType: 'image/png',
            screenshotHeight: 120,
            screenshotWidth: 240,
            selector: 'button',
          }),
        ],
        imageModel: 'bytedance-seed/seedream-4.5',
        projectId: 'project-1',
        prompt: 'Build a hero',
        textModel: 'custom-model',
        visionModel: 'moonshotai/kimi-k2.7-code',
      })
    })
  })

  it('leaves image/vision models undefined when omitted so role defaults apply', async () => {
    // Regression: the benchmark sends only textModel. Previously the handler
    // ran every role through resolveModelId, whose fallback is the CHAT model,
    // so image gen and vision OCR both hit `z-ai/glm-5.2` and 404'd. The
    // handler must forward `undefined` for omitted roles so streamLandingAgent
    // applies the configured image/vision defaults.
    await withServer(async ({ baseUrl, streamLandingAgent }) => {
      const response = await postJson(`${baseUrl}/agent`, {
        projectId: 'project-1',
        prompt: 'Build a hero',
        textModel: 'openrouter/custom-text-model',
      })

      expect(response.status).toBe(200)
      await expect(response.text()).resolves.toBe('event: done\ndata: {}\n\n')
      const call = streamLandingAgent.mock.calls[0]?.[0]
      expect(call).toMatchObject({
        projectId: 'project-1',
        prompt: 'Build a hero',
        textModel: 'custom-text-model',
      })
      expect(call.imageModel).toBeUndefined()
      expect(call.visionModel).toBeUndefined()
    })
  })

  it('creates, lists, reads, patches, and deletes projects', async () => {
    await withServer(async ({ baseUrl }) => {
      const createResponse = await postJson(`${baseUrl}/api/projects`, {
        model: 'zai-org/GLM-5.2',
        title: ' Launch Plan ',
      })
      expect(createResponse.status).toBe(201)
      const created = (await createResponse.json()) as {
        project: { id: string; title: string }
      }
      createdProjectIds.push(created.project.id)
      expect(created.project).toMatchObject({ title: 'Launch Plan' })

      const draftList = (await fetchJson(`${baseUrl}/api/projects`)) as {
        projects: Array<{ id: string }>
      }
      expect(draftList.projects).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: created.project.id }),
        ]),
      )

      const { createProjectHtmlStore } =
        await import('./mastra/lib/project-store.ts')
      createProjectHtmlStore(created.project.id).set('<main>Ready</main>')

      await expect(
        fetchJson(`${baseUrl}/api/projects/${created.project.id}`),
      ).resolves.toMatchObject({
        ok: true,
        project: {
          id: created.project.id,
          indexHtml: '<main>Ready</main>',
          title: 'Launch Plan',
        },
      })
      const generatedList = (await fetchJson(`${baseUrl}/api/projects`)) as {
        projects: Array<{ id: string }>
      }
      expect(generatedList.projects).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: created.project.id }),
        ]),
      )

      const patchResponse = await fetch(
        `${baseUrl}/api/projects/${created.project.id}`,
        {
          body: JSON.stringify({ textModel: 'openrouter/updated-model' }),
          headers: { 'content-type': 'application/json' },
          method: 'PATCH',
        },
      )
      expect(patchResponse.status).toBe(200)
      await expect(patchResponse.json()).resolves.toMatchObject({
        project: { model: 'updated-model' },
      })

      const badPatch = await fetch(
        `${baseUrl}/api/projects/${created.project.id}`,
        {
          body: JSON.stringify({ model: '' }),
          headers: { 'content-type': 'application/json' },
          method: 'PATCH',
        },
      )
      expect(badPatch.status).toBe(400)

      const deleteResponse = await fetch(
        `${baseUrl}/api/projects/${created.project.id}`,
        { method: 'DELETE' },
      )
      expect(deleteResponse.status).toBe(200)
      createdProjectIds.pop()

      const missing = await fetch(
        `${baseUrl}/api/projects/${created.project.id}`,
      )
      expect(missing.status).toBe(404)
    })
  })

  it('saves benchmark reports as local JSON for agent handoff', async () => {
    await withServer(async ({ baseUrl }) => {
      const response = await postJson(`${baseUrl}/api/benchmark-reports`, {
        generatedAt: '2026-07-04T00:00:00.000Z',
        reportVersion: '1',
        runs: [
          {
            cost: 0.01,
            modelId: 'z-ai/glm-5.2',
            promptText: 'Build a landing page',
            status: 'done',
          },
        ],
        userFeedback: {
          notes: 'CTA is vague and the tool used too many edits.',
          rating: 'needs-work',
        },
      })

      expect(response.status).toBe(201)
      const saved = (await response.json()) as {
        ok: boolean
        report: { bytes: number; id: string; path: string; savedAt: string }
      }
      expect(saved.ok).toBe(true)
      expect(saved.report).toMatchObject({
        bytes: expect.any(Number),
        id: expect.any(String),
        path: expect.stringContaining('benchmark-reports'),
        savedAt: expect.any(String),
      })
      createdBenchmarkReportPaths.push(saved.report.path)

      const file = JSON.parse(await readFile(saved.report.path, 'utf8')) as {
        id: string
        report: Record<string, unknown>
        savedAt: string
      }
      expect(file).toMatchObject({
        id: saved.report.id,
        report: {
          reportVersion: '1',
          userFeedback: { notes: expect.stringContaining('CTA is vague') },
        },
        savedAt: saved.report.savedAt,
      })
      expect(saved.report.bytes).toBeGreaterThan(0)

      const invalid = await postJson(`${baseUrl}/api/benchmark-reports`, {
        runs: [],
      })
      expect(invalid.status).toBe(400)
      await expect(invalid.json()).resolves.toEqual({
        error: 'Expected benchmark report with reportVersion and runs',
        ok: false,
      })
    })
  })

  it('serves in-memory and persisted project images', async () => {
    await withServer(async ({ baseUrl }) => {
      const { saveImage } = await import('./mastra/lib/image-store.ts')
      const pngId = saveImage(
        Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        'image/png',
      )

      const imageResponse = await fetch(`${baseUrl}/images/${pngId}.png`)
      expect(imageResponse.status).toBe(200)
      expect(imageResponse.headers.get('content-type')).toBe('image/png')
      expect(Buffer.from(await imageResponse.arrayBuffer())).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      )

      const missingImage = await fetch(`${baseUrl}/images/img-999.png`)
      expect(missingImage.status).toBe(404)

      const projectResponse = await postJson(`${baseUrl}/api/projects`, {})
      const { project } = (await projectResponse.json()) as {
        project: { id: string }
      }
      createdProjectIds.push(project.id)
      const { createProjectHtmlStore } =
        await import('./mastra/lib/project-store.ts')
      createProjectHtmlStore(project.id).set(
        `<main><img src="${baseUrl}/images/${pngId}.png" /></main>`,
      )

      const persisted = await fetch(
        `${baseUrl}/api/projects/${project.id}/images/${pngId}.png`,
      )
      expect(persisted.status).toBe(200)
      expect(persisted.headers.get('content-type')).toBe('image/png')

      const unsafe = await fetch(
        `${baseUrl}/api/projects/${project.id}/images/..%2Fsecret.png`,
      )
      expect(unsafe.status).toBe(404)
    })
  })

  it('validates screenshot response payloads', async () => {
    await withServer(async ({ baseUrl }) => {
      const invalidType = await postJson(
        `${baseUrl}/api/screenshot-responses/00000000-0000-0000-0000-000000000000`,
        { ...SCREENSHOT, mediaType: 'image/gif' },
      )
      expect(invalidType.status).toBe(400)
      await expect(invalidType.json()).resolves.toMatchObject({ ok: false })

      const invalidWidth = await postJson(
        `${baseUrl}/api/screenshot-responses/00000000-0000-0000-0000-000000000000`,
        { ...SCREENSHOT, width: 0 },
      )
      expect(invalidWidth.status).toBe(400)

      const nonPost = await fetch(
        `${baseUrl}/api/screenshot-responses/00000000-0000-0000-0000-000000000000`,
      )
      expect(nonPost.status).toBe(404)
    })
  })

  it('returns JSON 500 responses for malformed JSON bodies', async () => {
    await withServer(async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/api/projects`, {
        body: '{not-json',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })

      expect(response.status).toBe(500)
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

async function fetchJson(url: string) {
  const response = await fetch(url)
  return response.json()
}

async function listen(server: Server) {
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve())
  })
}

async function postJson(url: string, body: unknown) {
  return fetch(url, {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
}

async function withServer(
  fn: (context: {
    baseUrl: string
    streamLandingAgent: ReturnType<typeof vi.fn>
  }) => Promise<void>,
) {
  vi.resetModules()
  vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
  vi.stubEnv('CLIENT_ORIGIN', 'https://client.test')

  const streamLandingAgent = vi.fn<
    (input: {
      response: {
        end: (chunk: string) => void
        writeHead: (statusCode: number, headers: Record<string, string>) => void
      }
    }) => Promise<void>
  >(async ({ response }) => {
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    response.end('event: done\ndata: {}\n\n')
  })
  vi.doMock('./mastra/route.ts', () => ({
    resolveModelId: (model?: string) => {
      const requested = model ?? 'default-model'
      return requested.startsWith('openrouter/')
        ? requested.slice('openrouter/'.length)
        : requested
    },
    streamLandingAgent,
  }))

  const { server } = await import('./index.ts')
  await listen(server)
  const { port } = server.address() as AddressInfo

  try {
    await fn({
      baseUrl: `http://127.0.0.1:${port}`,
      streamLandingAgent,
    })
  } finally {
    await close(server)
  }
}
