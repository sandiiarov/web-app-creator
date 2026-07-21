import { request as httpRequest, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, it, vi } from 'vitest'

const MEBIBYTE = 1024 * 1024
const MEDIA_JSON_BODY_LIMIT = 24 * MEBIBYTE
const PROJECT_JSON_BODY_LIMIT = 64 * 1024

const IMAGE_ATTACHMENT = {
  dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
  id: 'image-1',
  mediaType: 'image/png',
  name: 'hero.png',
  size: 8,
}

const ELEMENT_ATTACHMENT = {
  kind: 'element',
  selector: 'button',
}

const createdProjectIds: string[] = []

afterEach(async () => {
  vi.doUnmock('./mastra/route.ts')
  vi.unstubAllEnvs()
  vi.resetModules()
  vi.restoreAllMocks()

  const { deleteProject } = await import('./mastra/lib/project-store.ts')
  await Promise.all(createdProjectIds.splice(0).map((id) => deleteProject(id)))
})

describe('server HTTP routes', () => {
  it('handles CORS preflight and not found responses', async () => {
    await withServer(async ({ baseUrl }) => {
      const options = await fetch(`${baseUrl}/agent`, {
        headers: { origin: 'https://client.test' },
        method: 'OPTIONS',
      })
      expect(options.status).toBe(204)
      expect(options.headers.get('access-control-allow-origin')).toBe(
        'https://client.test',
      )
      expect(options.headers.get('access-control-allow-methods')).toBe(
        'DELETE,GET,PATCH,POST,OPTIONS',
      )
      expect(options.headers.get('vary')).toBe('Origin')

      const missing = await fetch(`${baseUrl}/missing`)
      expect(missing.status).toBe(404)
      await expect(missing.json()).resolves.toEqual({
        error: 'Not found',
        ok: false,
      })
    })
  })

  it('allows matching browser origins to reach state-changing routes', async () => {
    await withServer(async ({ baseUrl, streamLandingAgent }) => {
      const response = await postJson(
        `${baseUrl}/agent`,
        { projectId: 'project-1', prompt: 'Build' },
        { origin: 'https://client.test' },
      )

      expect(response.status).toBe(200)
      expect(response.headers.get('access-control-allow-origin')).toBe(
        'https://client.test',
      )
      expect(response.headers.get('vary')).toBe('Origin')
      expect(streamLandingAgent).toHaveBeenCalledOnce()
    })
  })

  it('rejects mismatching browser origins before route side effects', async () => {
    await withServer(
      async ({ baseUrl, stopLandingAgent, streamLandingAgent }) => {
        for (const origin of ['https://other.test', 'null']) {
          const response = await postJson(
            `${baseUrl}/agent`,
            { projectId: 'project-1', prompt: 'Build' },
            { origin },
          )
          expect(response.status).toBe(403)
          await expect(response.json()).resolves.toEqual({
            error: 'Origin is not allowed.',
            ok: false,
          })
        }

        const preflight = await fetch(`${baseUrl}/agent`, {
          headers: { origin: 'https://other.test' },
          method: 'OPTIONS',
        })
        expect(preflight.status).toBe(403)

        const stop = await fetch(
          `${baseUrl}/api/projects/00000000-0000-0000-0000-000000000000/stop`,
          {
            headers: { origin: 'https://other.test' },
            method: 'POST',
          },
        )
        expect(stop.status).toBe(403)

        expect(streamLandingAgent).not.toHaveBeenCalled()
        expect(stopLandingAgent).not.toHaveBeenCalled()
      },
    )
  })

  it('bounds encoded JSON bodies by route without invoking handlers', async () => {
    await withServer(async ({ baseUrl, streamLandingAgent }) => {
      const accepted = await postJson(`${baseUrl}/api/projects`, {
        title: 'Small request',
      })
      expect(accepted.status).toBe(201)
      const created = (await accepted.json()) as { project: { id: string } }
      createdProjectIds.push(created.project.id)

      const smallOverflow = await postJson(`${baseUrl}/api/projects`, {
        padding: 'x'.repeat(PROJECT_JSON_BODY_LIMIT),
      })
      expect(smallOverflow.status).toBe(413)
      await expect(smallOverflow.json()).resolves.toEqual({
        error: 'Request body exceeds the allowed size.',
        ok: false,
      })

      const chunkedOverflow = await postChunkedJson(`${baseUrl}/agent`, [
        '{"projectId":"project-1","prompt":"',
        'x'.repeat(MEDIA_JSON_BODY_LIMIT),
        '"}',
      ])
      expect(chunkedOverflow.status).toBe(413)
      expect(chunkedOverflow.body).toEqual({
        error: 'Request body exceeds the allowed size.',
        ok: false,
      })
      expect(streamLandingAgent).not.toHaveBeenCalled()
    })
  })

  it('validates /agent request bodies before streaming', async () => {
    await withServer(async ({ baseUrl, streamLandingAgent }) => {
      const cases = [
        [{ projectId: 'project-1', prompt: '' }, 'Expected { prompt: string }'],
        [{ prompt: 'Build' }, 'Expected { projectId: string }'],
        [
          { projectId: 'project-1', prompt: 'Build', turnId: '' },
          'Expected { turnId?: string (1-128 characters) }',
        ],
        [
          { projectId: 'project-1', prompt: 'Build', turnId: 42 },
          'Expected { turnId?: string (1-128 characters) }',
        ],
        [
          {
            projectId: 'project-1',
            prompt: 'Build',
            turnId: 'x'.repeat(129),
          },
          'Expected { turnId?: string (1-128 characters) }',
        ],
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
            attachments: [{ ...ELEMENT_ATTACHMENT, selector: '' }],
            projectId: 'project-1',
            prompt: 'Build',
          },
          'Invalid attachment 1: expected a non-empty selector (1–300 characters).',
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

  it('validates decoded attachment sizes before streaming', async () => {
    await withServer(async ({ baseUrl, streamLandingAgent }) => {
      const mismatch = await postJson(`${baseUrl}/agent`, {
        attachments: [{ ...IMAGE_ATTACHMENT, size: IMAGE_ATTACHMENT.size + 1 }],
        projectId: 'project-1',
        prompt: 'Build',
      })
      expect(mismatch.status).toBe(400)
      await expect(mismatch.json()).resolves.toEqual({
        error:
          'Invalid attachment 1: declared size must match decoded dataUrl bytes.',
        ok: false,
      })

      const oversizedBytes = Buffer.alloc(8 * MEBIBYTE + 1)
      const oversized = await postJson(`${baseUrl}/agent`, {
        attachments: [
          {
            ...IMAGE_ATTACHMENT,
            dataUrl: `data:image/png;base64,${oversizedBytes.toString('base64')}`,
            size: 1,
          },
        ],
        projectId: 'project-1',
        prompt: 'Build',
      })
      expect(oversized.status).toBe(400)
      await expect(oversized.json()).resolves.toEqual({
        error:
          'Invalid attachment 1: decoded image must be between 1 byte and 8 MiB.',
        ok: false,
      })

      const aggregateBytes = Buffer.alloc(4 * MEBIBYTE + 1)
      const aggregateDataUrl = `data:image/png;base64,${aggregateBytes.toString('base64')}`
      const aggregate = await postJson(`${baseUrl}/agent`, {
        attachments: Array.from({ length: 4 }, (_, index) => ({
          ...IMAGE_ATTACHMENT,
          dataUrl: aggregateDataUrl,
          id: `image-${index}`,
          size: aggregateBytes.byteLength,
        })),
        projectId: 'project-1',
        prompt: 'Build',
      })
      expect(aggregate.status).toBe(400)
      await expect(aggregate.json()).resolves.toEqual({
        error: 'Attached items must be 16 MiB or smaller in total.',
        ok: false,
      })
      expect(streamLandingAgent).not.toHaveBeenCalled()
    })
  })

  it('streams valid /agent requests with normalized attachments, model ids, and turn id', async () => {
    await withServer(async ({ baseUrl, streamLandingAgent }) => {
      const response = await postJson(`${baseUrl}/agent`, {
        attachments: [IMAGE_ATTACHMENT, ELEMENT_ATTACHMENT],
        imageModel: 'openrouter/bytedance-seed/seedream-4.5',
        projectId: 'project-1',
        prompt: 'Build a hero',
        textModel: 'custom-model',
        turnId: 'turn-client-1',
        visionModel: 'openrouter/moonshotai/kimi-k2.7-code',
      })

      expect(response.status).toBe(200)
      await expect(response.text()).resolves.toBe('event: done\ndata: {}\n\n')
      const call = streamLandingAgent.mock.calls[0]?.[0]
      expect(call).toMatchObject({
        attachments: [
          expect.objectContaining({ name: 'hero.png' }),
          expect.objectContaining({
            kind: 'element',
            selector: 'button',
          }),
        ],
        imageModel: 'bytedance-seed/seedream-4.5',
        projectId: 'project-1',
        prompt: 'Build a hero',
        textModel: 'custom-model',
        turnId: 'turn-client-1',
        visionModel: 'moonshotai/kimi-k2.7-code',
      })
    })
  })

  it('leaves image/vision models undefined when omitted so role defaults apply', async () => {
    // Regression: callers may send only textModel. The handler must forward
    // `undefined` for omitted roles so streamLandingAgent applies the configured
    // image/vision defaults instead of substituting the chat model.
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

  it('PATCH persists vision and image models and they survive a GET (reload)', async () => {
    await withServer(async ({ baseUrl }) => {
      const createResponse = await postJson(`${baseUrl}/api/projects`, {
        title: 'Models',
      })
      expect(createResponse.status).toBe(201)
      const created = (await createResponse.json()) as {
        project: { id: string }
      }
      createdProjectIds.push(created.project.id)

      const patchResponse = await fetch(
        `${baseUrl}/api/projects/${created.project.id}`,
        {
          body: JSON.stringify({
            imageModel: 'openrouter/bytedance-seed/seedream-4.5',
            textModel: 'openrouter/z-ai/glm-5.2',
            visionModel: 'openrouter/z-ai/glm-5v-turbo',
          }),
          headers: { 'content-type': 'application/json' },
          method: 'PATCH',
        },
      )
      expect(patchResponse.status).toBe(200)
      await expect(patchResponse.json()).resolves.toMatchObject({
        project: {
          imageModel: 'bytedance-seed/seedream-4.5',
          model: 'z-ai/glm-5.2',
          visionModel: 'z-ai/glm-5v-turbo',
        },
      })

      // A fresh GET (simulating a reload) returns the persisted selection —
      // previously the server dropped imageModel/visionModel on write.
      await expect(
        fetchJson(`${baseUrl}/api/projects/${created.project.id}`),
      ).resolves.toMatchObject({
        project: {
          imageModel: 'bytedance-seed/seedream-4.5',
          model: 'z-ai/glm-5.2',
          visionModel: 'z-ai/glm-5v-turbo',
        },
      })
    })
  })

  it('POST /api/projects/:id/stop gracefully stops the active run', async () => {
    await withServer(async ({ baseUrl, stopLandingAgent }) => {
      const createResponse = await postJson(`${baseUrl}/api/projects`, {
        title: 'Stop',
      })
      const created = (await createResponse.json()) as {
        project: { id: string }
      }
      createdProjectIds.push(created.project.id)

      const response = await fetch(
        `${baseUrl}/api/projects/${created.project.id}/stop`,
        { method: 'POST' },
      )
      expect(response.status).toBe(200)
      // The handler delegates to stopLandingAgent (graceful: aborts the Mastra
      // stream but leaves the SSE response open) and echoes whether a run was
      // found and stopped.
      expect(stopLandingAgent).toHaveBeenCalledWith(created.project.id)
      await expect(response.json()).resolves.toEqual({
        ok: true,
        stopped: true,
      })

      // When no run is active the endpoint still succeeds but reports stopped=false.
      stopLandingAgent.mockReturnValueOnce(false)
      const idle = await fetch(
        `${baseUrl}/api/projects/${created.project.id}/stop`,
        { method: 'POST' },
      )
      await expect(idle.json()).resolves.toEqual({ ok: true, stopped: false })
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

describe('project events SSE', () => {
  it('GET /api/projects/:id/events emits a state snapshot for an idle project', async () => {
    await withServer(async ({ baseUrl }) => {
      const { createProject } = await import('./mastra/lib/project-store.ts')
      const project = await createProject({ title: 'Events idle' })
      createdProjectIds.push(project.id)

      const controller = new AbortController()
      const response = await fetch(
        `${baseUrl}/api/projects/${project.id}/events`,
        { signal: controller.signal },
      )
      expect(response.status).toBe(200)
      const frame = await readSseFrameUntil(
        response,
        (entry) => entry.event === 'state',
      )
      controller.abort()

      const state = frame.data as {
        html: string
        models: { image: string; text: string; vision: string }
        status: string
        turns: unknown[]
      }
      expect(state.status).toBe('idle')
      expect(state.turns).toEqual([])
      expect(state.models).toEqual({ image: '', text: '', vision: '' })
    })
  })

  it('GET /api/projects/events snapshots statuses then tails a live setRunStatusSync change', async () => {
    await withServer(async ({ baseUrl }) => {
      const { createProject, createProjectHtmlStore, setRunStatusSync } =
        await import('./mastra/lib/project-store.ts')
      const project = await createProject({ title: 'Events live' })
      createdProjectIds.push(project.id)
      // Give it HTML so it survives listProjects' hasHtml filter.
      createProjectHtmlStore(project.id).set('<!doctype html><p>live</p>')

      const controller = new AbortController()
      const response = await fetch(`${baseUrl}/api/projects/events`, {
        signal: controller.signal,
      })

      const initial = await readSseFrameUntil(
        response,
        (entry) =>
          entry.event === 'project_status' &&
          isStatusFor(entry.data, project.id),
      )
      expect(statusOf(initial.data)).toBe('idle')

      // setRunStatusSync fans out to the open list subscriber via broadcastStatus.
      setRunStatusSync(project.id, { status: 'running', turnId: 'turn-1' })

      const updated = await readSseFrameUntil(
        response,
        (entry) =>
          entry.event === 'project_status' &&
          isStatusFor(entry.data, project.id) &&
          statusOf(entry.data) === 'running',
      )
      expect(statusOf(updated.data)).toBe('running')
      expect((updated.data as { runTurnId: string }).runTurnId).toBe('turn-1')
      controller.abort()
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

function isStatusFor(data: unknown, projectId: string): boolean {
  return (
    !!data &&
    typeof data === 'object' &&
    (data as { projectId?: unknown }).projectId === projectId
  )
}

async function listen(server: Server) {
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve())
  })
}

/** Parse one SSE frame (`event:`/`data:` lines) into `{event, data}`. */
function parseSseFrame(frame: string): { data: unknown; event: string } {
  let event = 'message'
  let data: unknown = null
  for (const line of frame.split('\n')) {
    if (line.startsWith('event: ')) {
      event = line.slice(7).trim()
    } else if (line.startsWith('data: ')) {
      try {
        data = JSON.parse(line.slice(6))
      } catch {
        data = line.slice(6)
      }
    }
  }
  return { data, event }
}

async function postChunkedJson(url: string, chunks: Iterable<string>) {
  return new Promise<{ body: unknown; status: number }>((resolve, reject) => {
    const request = httpRequest(
      url,
      {
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      },
      (response) => {
        const responseChunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => responseChunks.push(chunk))
        response.once('error', reject)
        response.once('end', () => {
          resolve({
            body: JSON.parse(Buffer.concat(responseChunks).toString('utf8')),
            status: response.statusCode ?? 0,
          })
        })
      },
    )
    request.once('error', reject)
    for (const chunk of chunks) request.write(chunk)
    request.end()
  })
}

async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return fetch(url, {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
    method: 'POST',
  })
}

/** Read frames from a streaming fetch Response until `predicate` matches or the
 *  stream ends. Bounded so an unrelated flood can't hang the test. */
async function readSseFrameUntil(
  response: Response,
  predicate: (frame: { data: unknown; event: string }) => boolean,
  maxFrames = 500,
): Promise<{ data: unknown; event: string }> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (maxFrames-- > 0) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let index: number
      while ((index = buffer.indexOf('\n\n')) !== -1) {
        const parsed = parseSseFrame(buffer.slice(0, index))
        buffer = buffer.slice(index + 2)
        if (predicate(parsed)) return parsed
      }
    }
  } finally {
    reader.releaseLock()
  }
  throw new Error('matching SSE frame not found before stream end')
}

function statusOf(data: unknown): string {
  return (data as { status?: string }).status ?? ''
}

async function withServer(
  fn: (context: {
    baseUrl: string
    stopLandingAgent: ReturnType<typeof vi.fn>
    streamLandingAgent: ReturnType<typeof vi.fn>
  }) => Promise<void>,
) {
  vi.resetModules()
  vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
  vi.stubEnv('CLIENT_ORIGIN', 'https://client.test')

  const stopLandingAgent = vi.fn<() => boolean>(() => true)
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
    stopLandingAgent,
    streamLandingAgent,
  }))

  const { server } = await import('./index.ts')
  await listen(server)
  const { port } = server.address() as AddressInfo

  try {
    await fn({
      baseUrl: `http://127.0.0.1:${port}`,
      stopLandingAgent,
      streamLandingAgent,
    })
  } finally {
    await close(server)
  }
}
