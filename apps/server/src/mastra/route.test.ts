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

    let capturedMessages: Array<{ content: string; role: string }> = []
    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async (messages: Array<{ content: string; role: string }>) => {
          capturedMessages = messages
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

    expect(capturedMessages.at(-1)).toMatchObject({
      content: expect.stringContaining('Use this reference image.'),
      role: 'user',
    })
    expect(capturedMessages.at(-1)?.content).toContain(
      'Attached image OCR/visual transcript',
    )
    expect(capturedMessages.at(-1)?.content).toContain(
      'Headline: Ship a sharper page',
    )
    expect(capturedMessages.at(-1)?.content).toContain(
      'wireframe.png (image/png, 68 bytes)',
    )

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
          analysisText: expect.stringContaining(
            'Headline: Ship a sharper page',
          ),
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

describe('streamLandingAgent cost accounting', () => {
  it('uses provider-reported LLM cost from raw stream chunks', async () => {
    vi.stubEnv('BASETEN_API_KEY', 'test-baseten-key')

    let capturedOptions: Record<string, unknown> | undefined
    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async (
          _messages: unknown,
          options: Record<string, unknown>,
        ) => {
          capturedOptions = options
          return fakeAgentStream(rawCostStream(), {
            cachedInputTokens: 0,
            inputTokens: 23,
            outputTokens: 8,
            totalTokens: 31,
          })
        },
      }),
    }))

    const { createProject } = await import('./lib/project-store.ts')
    const project = await createProject()
    createdProjectIds.push(project.id)
    const { streamLandingAgent } = await import('./route.ts')
    const response = new FakeResponse()

    await streamLandingAgent({
      modelId: 'zai-org/GLM-5.2',
      projectId: project.id,
      prompt: 'Test provider cost.',
      request: fakeRequest(),
      response: response as unknown as ServerResponse,
    })

    expect(capturedOptions).toMatchObject({
      includeRawChunks: true,
      maxProcessorRetries: 2,
      modelSettings: { maxOutputTokens: 16_384, maxRetries: 0 },
    })
    const errorProcessors = capturedOptions?.errorProcessors as
      | Array<{ id: string }>
      | undefined
    expect(errorProcessors?.[0]?.id).toBe('landing-agent-retry-processor')
    expect(parseSseEvents(response.body)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            cost: 0.0123,
            costBreakdown: expect.objectContaining({ llm: 0.0123 }),
          }),
          event: 'stats',
        }),
      ]),
    )
  })

  it('calculates LLM cost from tokens when provider cost is absent', async () => {
    vi.stubEnv('BASETEN_API_KEY', 'test-baseten-key')

    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async () =>
          fakeAgentStream(emptyFullStream(), {
            cachedInputTokens: 3360,
            inputTokens: 4981,
            outputTokens: 67,
            totalTokens: 5048,
          }),
      }),
    }))

    const { createProject } = await import('./lib/project-store.ts')
    const project = await createProject()
    createdProjectIds.push(project.id)
    const { streamLandingAgent } = await import('./route.ts')
    const response = new FakeResponse()

    await streamLandingAgent({
      modelId: 'zai-org/GLM-5.2',
      projectId: project.id,
      prompt: 'Test calculated cost.',
      request: fakeRequest(),
      response: response as unknown as ServerResponse,
    })

    expect(parseSseEvents(response.body)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            cost: expect.closeTo(0.0034378, 8),
            costBreakdown: expect.objectContaining({
              llm: expect.closeTo(0.0034378, 8),
            }),
          }),
          event: 'stats',
        }),
      ]),
    )
  })
})

describe('streamLandingAgent retries', () => {
  it('emits retry events with issue, attempt, max attempts, and delay', async () => {
    vi.stubEnv('BASETEN_API_KEY', 'test-baseten-key')
    vi.stubEnv('AGENT_RETRY_BASE_DELAY_MS', '0')
    vi.stubEnv('AGENT_RETRY_MAX_DELAY_MS', '0')

    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async (
          _messages: unknown,
          options: Record<string, unknown>,
        ) => {
          const [processor] = options.errorProcessors as Array<{
            processAPIError: (args: unknown) => Promise<unknown>
          }>
          await processor?.processAPIError({
            error: Object.assign(new Error('socket hang up'), {
              code: 'ECONNRESET',
            }),
            retryCount: 0,
          })
          return fakeAgentStream()
        },
      }),
    }))

    const { createProject } = await import('./lib/project-store.ts')
    const project = await createProject()
    createdProjectIds.push(project.id)
    const { streamLandingAgent } = await import('./route.ts')
    const response = new FakeResponse()

    await streamLandingAgent({
      modelId: 'zai-org/GLM-5.2',
      projectId: project.id,
      prompt: 'Test visible retry.',
      request: fakeRequest(),
      response: response as unknown as ServerResponse,
    })

    expect(parseSseEvents(response.body)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: {
            attempt: 1,
            delayMs: 0,
            issue: 'ECONNRESET',
            maxAttempts: 2,
            reason: 'Transient network issue',
          },
          event: 'retry',
        }),
      ]),
    )
  })
})

describe('streamLandingAgent html updates', () => {
  it('emits html_update after a successful changed edit', async () => {
    vi.stubEnv('BASETEN_API_KEY', 'test-baseten-key')

    const nextHtml =
      '<!doctype html><html><head><title>Updated</title></head><body><main><h1>Updated hero</h1></main></body></html>'
    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: (store: { set: (html: string) => void }) => ({
        stream: async () =>
          fakeAgentStream(
            editToolStream({ mutate: () => store.set(nextHtml) }),
          ),
      }),
    }))

    const { createProject, getProject } = await import('./lib/project-store.ts')
    const project = await createProject()
    createdProjectIds.push(project.id)
    const { streamLandingAgent } = await import('./route.ts')
    const response = new FakeResponse()

    await streamLandingAgent({
      modelId: 'zai-org/GLM-5.2',
      projectId: project.id,
      prompt: 'Update the hero.',
      request: fakeRequest(),
      response: response as unknown as ServerResponse,
    })

    const events = parseSseEvents(response.body)
    const editDoneIndex = events.findIndex(
      ({ data, event }) =>
        event === 'tool_call' &&
        isRecord(data) &&
        data.tool === 'edit' &&
        data.state === 'done',
    )
    const htmlUpdateIndex = events.findIndex(
      ({ event }) => event === 'html_update',
    )

    expect(editDoneIndex).toBeGreaterThanOrEqual(0)
    expect(htmlUpdateIndex).toBeGreaterThan(editDoneIndex)
    const htmlUpdateEvent = events[htmlUpdateIndex]
    if (!htmlUpdateEvent) throw new Error('Expected html_update event.')
    expect(htmlUpdateEvent).toEqual({
      data: {
        bytes: nextHtml.length,
        hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        html: nextHtml,
        previousHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        projectId: project.id,
        sequence: 1,
      },
      event: 'html_update',
    })
    const htmlUpdateData = htmlUpdateEvent.data as {
      hash: string
      previousHash: string
    }
    expect(htmlUpdateData.hash).not.toBe(htmlUpdateData.previousHash)

    await expect(getProject(project.id)).resolves.toMatchObject({
      indexHtml: nextHtml,
    })
  })

  it('does not emit html_update for failed edits', async () => {
    vi.stubEnv('BASETEN_API_KEY', 'test-baseten-key')

    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async () =>
          fakeAgentStream(
            editToolStream({ callId: 'call-edit-failed', isError: true }),
          ),
      }),
    }))

    const { createProject } = await import('./lib/project-store.ts')
    const project = await createProject()
    createdProjectIds.push(project.id)
    const { streamLandingAgent } = await import('./route.ts')
    const response = new FakeResponse()

    await streamLandingAgent({
      modelId: 'zai-org/GLM-5.2',
      projectId: project.id,
      prompt: 'Try an edit.',
      request: fakeRequest(),
      response: response as unknown as ServerResponse,
    })

    expect(htmlUpdateEvents(response.body)).toEqual([])
  })

  it('does not emit html_update when successful edits leave HTML unchanged', async () => {
    vi.stubEnv('BASETEN_API_KEY', 'test-baseten-key')

    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async () =>
          fakeAgentStream(editToolStream({ callId: 'call-edit-unchanged' })),
      }),
    }))

    const { createProject } = await import('./lib/project-store.ts')
    const project = await createProject()
    createdProjectIds.push(project.id)
    const { streamLandingAgent } = await import('./route.ts')
    const response = new FakeResponse()

    await streamLandingAgent({
      modelId: 'zai-org/GLM-5.2',
      projectId: project.id,
      prompt: 'Try an edit.',
      request: fakeRequest(),
      response: response as unknown as ServerResponse,
    })

    expect(htmlUpdateEvents(response.body)).toEqual([])
  })
})

describe('streamLandingAgent history', () => {
  it('sends persisted project messages before the current prompt', async () => {
    vi.stubEnv('BASETEN_API_KEY', 'test-baseten-key')

    let capturedMessages: Array<{ content: string; role: string }> = []
    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async (messages: Array<{ content: string; role: string }>) => {
          capturedMessages = messages
          return fakeAgentStream()
        },
      }),
    }))

    const { appendProjectMessageTurn, createProject } =
      await import('./lib/project-store.ts')
    const project = await createProject()
    createdProjectIds.push(project.id)
    await appendProjectMessageTurn(project.id, {
      htmlSwaps: 1,
      id: 'turn-history-1',
      isStreaming: false,
      model: 'zai-org/GLM-5.2',
      parts: [
        {
          id: 'turn-history-1-text-1',
          text: 'I created the initial Forge landing page.',
          type: 'text',
        },
        {
          id: 'tool-history-1-read',
          intent: 'Inspect /index.html',
          result: 'Read 50 lines of 943',
          state: 'done',
          tool: 'read',
          type: 'tool_call',
        },
      ],
      prompt: 'Create a nice landing page for AI coding agent',
    })

    const { streamLandingAgent } = await import('./route.ts')
    const response = new FakeResponse()

    await streamLandingAgent({
      modelId: 'zai-org/GLM-5.2',
      projectId: project.id,
      prompt: 'what i asked you todo',
      request: fakeRequest(),
      response: response as unknown as ServerResponse,
    })

    expect(capturedMessages).toEqual([
      {
        content: 'Create a nice landing page for AI coding agent',
        role: 'user',
      },
      {
        content: expect.stringContaining(
          'I created the initial Forge landing page.',
        ),
        role: 'assistant',
      },
      { content: 'what i asked you todo', role: 'user' },
    ])
    expect(capturedMessages[1]?.content).not.toContain('Tool read done')
    expect(capturedMessages[1]?.content).not.toContain('Intent:')
    expect(capturedMessages[1]?.content).not.toContain('Result:')
  })
})

describe('streamLandingAgent screenshots', () => {
  it('emits screenshot_request events with project correlation', async () => {
    vi.stubEnv('BASETEN_API_KEY', 'test-baseten-key')

    let capturedScreenshot: unknown
    let capturedScreenshotRequest: unknown
    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./lib/browser-screenshot.ts', () => ({
      createPendingBrowserScreenshot: vi.fn<
        () => {
          promise: Promise<{
            dataUrl: string
            height: number
            mediaType: 'image/jpeg'
            width: number
          }>
          requestId: string
        }
      >(() => ({
        promise: Promise.resolve({
          dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
          height: 600,
          mediaType: 'image/jpeg',
          width: 800,
        }),
        requestId: '00000000-0000-0000-0000-000000000001',
      })),
    }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: (
        _store: unknown,
        _mastra: unknown,
        _baseUrl: string,
        _modelId: string,
        requestScreenshot: (input: {
          selector: string
          timeoutMs: number
          viewportSize: 'desktop' | 'mobile' | 'tablet'
        }) => Promise<unknown>,
      ) => ({
        stream: async () => {
          const input = {
            selector: '#hero .cta',
            timeoutMs: 25_000,
            viewportSize: 'mobile' as const,
          }
          capturedScreenshotRequest = input
          capturedScreenshot = await requestScreenshot(input)
          return fakeAgentStream()
        },
      }),
    }))

    const { createProject } = await import('./lib/project-store.ts')
    const project = await createProject()
    createdProjectIds.push(project.id)
    const { streamLandingAgent } = await import('./route.ts')
    const response = new FakeResponse()

    await streamLandingAgent({
      modelId: 'zai-org/GLM-5.2',
      projectId: project.id,
      prompt: 'Check the page visually.',
      request: fakeRequest(),
      response: response as unknown as ServerResponse,
    })

    expect(capturedScreenshotRequest).toMatchObject({
      selector: '#hero .cta',
      viewportSize: 'mobile',
    })
    expect(capturedScreenshot).toMatchObject({ height: 600, width: 800 })
    expect(parseSseEvents(response.body)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: {
            projectId: project.id,
            requestId: '00000000-0000-0000-0000-000000000001',
            selector: '#hero .cta',
            viewportSize: 'mobile',
          },
          event: 'screenshot_request',
        }),
      ]),
    )
  })

  it('summarizes screenshot tool results and adds vision cost', async () => {
    vi.stubEnv('BASETEN_API_KEY', 'test-baseten-key')

    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async () => fakeAgentStream(screenshotToolStream()),
      }),
    }))

    const { createProject } = await import('./lib/project-store.ts')
    const project = await createProject()
    createdProjectIds.push(project.id)
    const { streamLandingAgent } = await import('./route.ts')
    const response = new FakeResponse()

    await streamLandingAgent({
      modelId: 'zai-org/GLM-5.2',
      projectId: project.id,
      prompt: 'Review the rendered result.',
      request: fakeRequest(),
      response: response as unknown as ServerResponse,
    })

    const events = parseSseEvents(response.body)
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            result: expect.stringContaining('Captured 800×600 screenshot'),
            state: 'done',
            tool: 'screenshot',
          }),
          event: 'tool_call',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            cost: 0.006,
            costBreakdown: expect.objectContaining({
              vision: { calls: 1, cost: 0.006, images: 1 },
            }),
          }),
          event: 'stats',
        }),
      ]),
    )
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

async function* editToolStream({
  callId = 'call-edit-1',
  isError = false,
  mutate,
}: {
  callId?: string
  isError?: boolean
  mutate?: () => void
}) {
  yield {
    payload: {
      args: { intent: 'Update hero copy' },
      toolCallId: callId,
      toolName: 'edit',
    },
    type: 'tool-call',
  }
  mutate?.()
  yield {
    payload: {
      args: { intent: 'Update hero copy' },
      isError,
      result: isError
        ? { reason: 'oldText did not match' }
        : { changedLines: 2 },
      toolCallId: callId,
      toolName: 'edit',
    },
    type: 'tool-result',
  }
}

async function* emptyFullStream(): AsyncGenerator<never, void, unknown> {}

function fakeAgentStream(
  fullStream: AsyncIterable<unknown> = emptyFullStream(),
  usage: Record<string, number | undefined> = {
    cachedInputTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  },
) {
  return {
    finishReason: Promise.resolve('stop'),
    fullStream,
    usage: Promise.resolve(usage),
  }
}

function fakeRequest(): IncomingMessage {
  const request = new EventEmitter() as IncomingMessage
  request.headers = { host: 'localhost:3001' }
  return request
}

function htmlUpdateEvents(body: string) {
  return parseSseEvents(body).filter(({ event }) => event === 'html_update')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
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

async function* rawCostStream() {
  yield {
    payload: {
      id: 'chatcmpl-provider-cost-1',
      object: 'chat.completion.chunk',
      usage: {
        completion_tokens: 8,
        cost: 0.0123,
        prompt_tokens: 23,
        total_tokens: 31,
      },
    },
    type: 'raw',
  }
}

async function* screenshotToolStream() {
  yield {
    payload: {
      args: { selector: '#hero', viewportSize: 'tablet' },
      toolCallId: 'call-screenshot-1',
      toolName: 'screenshot',
    },
    type: 'tool-call',
  }
  yield {
    payload: {
      args: { selector: '#hero', viewportSize: 'tablet' },
      isError: false,
      result: {
        height: 600,
        imageOcr: {
          cost: 0.006,
          imagesAnalyzed: 1,
          ok: true,
          text: 'Image 1\nHero headline visible. CTA is clipped.',
          usage: {
            completionTokens: 20,
            promptTokens: 30,
            totalTokens: 50,
          },
        },
        mediaType: 'image/jpeg',
        ok: true,
        selector: '#hero',
        text: 'Image 1\nHero headline visible. CTA is clipped.',
        viewportSize: 'tablet',
        width: 800,
      },
      toolCallId: 'call-screenshot-1',
      toolName: 'screenshot',
    },
    type: 'tool-result',
  }
}
