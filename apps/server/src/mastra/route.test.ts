import { EventEmitter } from 'node:events'
import type {
  IncomingMessage,
  OutgoingHttpHeaders,
  ServerResponse,
} from 'node:http'

import { afterEach, describe, expect, it, vi } from 'vitest'

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgo='

const createdProjectIds: string[] = []

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
  vi.restoreAllMocks()

  const { deleteProject } = await import('./lib/project-store.ts')
  await Promise.all(createdProjectIds.splice(0).map((id) => deleteProject(id)))
})

describe('streamLandingAgent attachments', () => {
  it('analyzes attachments before the agent run and persists tool metadata', async () => {
    vi.stubEnv('BASETEN_API_KEY', 'test-baseten-key')
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')

    let capturedPrompt = ''
    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async (prompt: string) => {
          capturedPrompt = prompt
          return fakeAgentStream()
        },
      }),
    }))

    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = String(input)
      if (url.includes('/generation')) return jsonResponse({ data: {} })
      return jsonResponse({
        choices: [
          {
            message: {
              content:
                'Image 1\nHeadline: Ship a sharper page\nVisual: monochrome wireframe with square cards',
            },
          },
        ],
        id: 'gen-route-1',
        usage: {
          completion_tokens: 12,
          cost: 0.004,
          prompt_tokens: 24,
          total_tokens: 36,
        },
      })
    })
    vi.stubGlobal('fetch', fetch)

    const { createProject, getProject } = await import('./lib/project-store.ts')
    const project = await createProject()
    createdProjectIds.push(project.id)
    const { streamLandingAgent } = await import('./route.ts')
    const response = new FakeResponse()

    await streamLandingAgent({
      attachments: [
        {
          dataUrl: PNG_DATA_URL,
          id: 'image-1',
          mediaType: 'image/png',
          name: 'wireframe.png',
          size: 68,
        },
      ],
      modelId: 'zai-org/GLM-5.2',
      projectId: project.id,
      prompt: 'Use this reference image.',
      request: fakeRequest(),
      response: response as unknown as ServerResponse,
    })

    expect(capturedPrompt).toContain('Use this reference image.')
    expect(capturedPrompt).toContain('Attached image OCR/visual transcript')
    expect(capturedPrompt).toContain('Headline: Ship a sharper page')
    expect(capturedPrompt).toContain('wireframe.png (image/png, 68 bytes)')

    const events = parseSseEvents(response.body)
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            state: 'running',
            tool: 'analyze_image',
          }),
          event: 'tool_call',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            result: 'Analyzed 1 attached image',
            state: 'done',
            tool: 'analyze_image',
          }),
          event: 'tool_call',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            costBreakdown: expect.objectContaining({
              vision: { calls: 1, cost: 0.004, images: 1 },
            }),
          }),
          event: 'stats',
        }),
      ]),
    )

    const saved = await getProject(project.id)
    expect(saved?.messages[0]).toMatchObject({
      attachments: [
        {
          id: 'image-1',
          mediaType: 'image/png',
          name: 'wireframe.png',
          size: 68,
        },
      ],
      parts: expect.arrayContaining([
        expect.objectContaining({
          state: 'done',
          tool: 'analyze_image',
          type: 'tool_call',
        }),
      ]),
      prompt: 'Use this reference image.',
    })
    expect(JSON.stringify(saved?.messages[0])).not.toContain(PNG_DATA_URL)
  })
})

class FakeResponse {
  readonly chunks: string[] = []
  headersSent = false

  get body() {
    return this.chunks.join('')
  }

  end(chunk?: unknown) {
    if (chunk !== undefined) this.write(chunk)
    return this
  }

  setHeader(_name: string, _value: unknown) {
    return this
  }

  write(chunk: unknown) {
    this.chunks.push(String(chunk))
    return true
  }

  writeHead(_statusCode: number, _headers?: OutgoingHttpHeaders) {
    this.headersSent = true
    return this
  }
}

async function* emptyFullStream(): AsyncGenerator<never, void, unknown> {}

function fakeAgentStream() {
  return {
    finishReason: Promise.resolve('stop'),
    fullStream: emptyFullStream(),
    usage: Promise.resolve({
      cachedInputTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    }),
  }
}

function fakeRequest(): IncomingMessage {
  const request = new EventEmitter() as IncomingMessage
  request.headers = { host: 'localhost:3001' }
  return request
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  })
}

function parseSseEvents(body: string): Array<{ data: unknown; event: string }> {
  return body
    .trim()
    .split('\n\n')
    .filter(Boolean)
    .map((frame) => {
      let event = 'message'
      let data: unknown = null
      for (const line of frame.split('\n')) {
        if (line.startsWith('event: ')) event = line.slice(7)
        if (line.startsWith('data: ')) data = JSON.parse(line.slice(6))
      }
      return { data, event }
    })
}
