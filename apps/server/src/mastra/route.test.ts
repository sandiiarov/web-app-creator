import { EventEmitter } from 'node:events'
import type {
  IncomingMessage,
  OutgoingHttpHeaders,
  ServerResponse,
} from 'node:http'

import type { Mastra } from '@mastra/core/mastra'
import type { Memory } from '@mastra/memory'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { OperationScope } from '../providers/operation-scope.ts'
import { createProviderTransport } from '../providers/transport.ts'
import {
  createRuntimeFixture,
  type RuntimeFixture,
} from '../testing/runtime-fixture.ts'
import {
  createModelCapabilities,
  type ModelCapabilities,
} from './lib/model-capabilities.ts'
import { createLandingAgentRunner, type LandingAgentRunner } from './route.ts'
import type { AgentAttachmentInput } from './route.ts'

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgo='

const createdProjectIds: string[] = []
let runtimeFixture: RuntimeFixture | undefined
let testRunner: LandingAgentRunner | undefined
let testCapabilities: ModelCapabilities | undefined
let expectedBlockedRunner = false

async function getRuntimeFixture() {
  runtimeFixture ??= await createRuntimeFixture()
  return runtimeFixture
}

async function getTestRunner() {
  if (testRunner) return testRunner
  const fixture = await getRuntimeFixture()
  const agentModule = await import('./agents/landing-page-agent.ts')
  const ocrModule = await import('./lib/image-ocr.ts')
  const screenshotModule = await import('./lib/project-screenshot.ts')
  testRunner = createLandingAgentRunner({
    bus: fixture.runtime.runBus,
    capabilities: testCapabilities ?? {
      async contextWindowTokens() {
        return undefined
      },
      async supportsImageInput(modelId) {
        return modelId.startsWith('acme/vision-chat')
      },
    },
    captureProjectSelectors: screenshotModule.captureProjectSelectors,
    createAgent: (store, baseUrl, textModel, capture, options) =>
      agentModule.createLandingPageAgent(
        store,
        {} as Mastra,
        {} as Memory,
        baseUrl,
        {
          ...options,
          imageStore: fixture.runtime.imageStore,
          repository: fixture.runtime.repository,
        },
        textModel,
        capture,
      ),
    ocrImageInputs: ocrModule.ocrImageInputs,
    repository: fixture.runtime.repository,
    runtimeConfig: fixture.runtime.config,
    transport: createProviderTransport(),
  })
  return testRunner
}

afterEach(async () => {
  const runner = testRunner
  const fixture = runtimeFixture
  testRunner = undefined
  runtimeFixture = undefined
  testCapabilities = undefined
  createdProjectIds.splice(0)
  const failures: unknown[] = []
  try {
    runner?.close()
    await runner?.waitForIdle()
  } catch (error) {
    if (!expectedBlockedRunner) failures.push(error)
  }
  try {
    await fixture?.dispose()
  } catch (error) {
    failures.push(error)
  } finally {
    expectedBlockedRunner = false
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.resetModules()
    vi.restoreAllMocks()
  }
  if (failures.length > 0) throw new AggregateError(failures)
})

/**
 * Test compatibility shim for the old `streamLandingAgent({ projectId, prompt,
 * request, response, ... })` API. The real export is now `startLandingAgent`
 * (fire-and-forget, bus-based). This shim subscribes the passed response to the
 * run bus, starts the detached run, awaits its completion (so log/project
 * assertions observe terminal state), and reconstructs the SSE error/done
 * frames the old not_found/overlap paths emitted directly — keeping the
 * existing SSE-based assertions intact.
 */
async function streamLandingAgent({
  attachments,
  imageModel,
  projectId,
  prompt,
  request,
  response,
  textModel,
  turnId,
  visionModel,
}: {
  attachments?: AgentAttachmentInput[]
  imageModel?: string
  projectId: string
  prompt: string
  request: IncomingMessage
  response: ServerResponse
  textModel: string
  turnId?: string
  visionModel?: string
}) {
  const runner = await getTestRunner()
  const { endSse } = await import('./lib/sse.ts')
  const baseUrl = `http://${request.headers.host ?? `localhost:3001`}`

  const result = await runner.start({
    attachments,
    baseUrl,
    imageModel,
    projectId,
    prompt,
    subscriber: response,
    textModel,
    turnId,
    visionModel,
  })

  if (!result.ok) {
    if (result.reason === 'not_found') {
      response.writeHead(404, { 'content-type': 'text/event-stream' })
    }
    response.write(
      `event: error\ndata: ${JSON.stringify({
        message:
          result.reason === 'not_found'
            ? 'Project not found'
            : 'A run is already active for this project.',
      })}\n\n`,
    )
    response.write('event: done\ndata: {}\n\n')
    endSse(response)
    return
  }

  // Await the detached run's release so log/project assertions see terminal state.
  await runner.waitForIdle()
  endSse(response)
}

describe('streamLandingAgent missing projects', () => {
  it('returns an SSE error when the project does not exist', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: vi.fn<() => never>(),
    }))

    const response = new FakeResponse()

    await streamLandingAgent({
      projectId: '00000000-0000-0000-0000-000000000000',
      prompt: 'Build',
      request: fakeRequest(),
      response: response as unknown as ServerResponse,
      textModel: 'z-ai/glm-5.2',
    })

    expect(response.statusCode).toBe(404)
    expect(parseSseEvents(response.body)).toEqual([
      { data: { message: 'Project not found' }, event: 'error' },
      { data: {}, event: 'done' },
    ])
  })
})

describe('streamLandingAgent turnId', () => {
  it('persists a supplied turnId through logs and hydration', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async () => fakeAgentStream(),
      }),
    }))

    const { createProject, getProject, readClientMessages } = (
      await getRuntimeFixture()
    ).runtime.repository
    const project = await createProject()
    createdProjectIds.push(project.id)

    await streamLandingAgent({
      projectId: project.id,
      prompt: 'Build with correlation.',
      request: fakeRequest(),
      response: new FakeResponse() as unknown as ServerResponse,
      textModel: 'z-ai/glm-5.2',
      turnId: 'turn-client-1',
    })

    expect(await readClientMessages(project.id)).toContainEqual(
      expect.objectContaining({
        dir: 'in',
        turnId: 'turn-client-1',
        type: 'prompt',
      }),
    )
    await expect(getProject(project.id)).resolves.toMatchObject({
      messages: [expect.objectContaining({ id: 'turn-client-1' })],
    })
  })
})

describe('streamLandingAgent durable event publication', () => {
  it('does not broadcast an event whose authoritative append fails', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async () => fakeAgentStream(),
      }),
    }))

    const fixture = await getRuntimeFixture()
    const { repository } = fixture.runtime
    const project = await repository.createProject()
    createdProjectIds.push(project.id)
    const append = repository.appendClientMessage.bind(repository)
    vi.spyOn(repository, 'appendClientMessage').mockImplementation(
      async (id, entry) => {
        if (entry.dir === 'out') throw new Error('journal unavailable')
        return append(id, entry)
      },
    )
    const response = new FakeResponse()

    await expect(
      streamLandingAgent({
        projectId: project.id,
        prompt: 'Do not publish before commit.',
        request: fakeRequest(),
        response: response as unknown as ServerResponse,
        textModel: 'z-ai/glm-5.2',
      }),
    ).rejects.toThrow('Landing agent runner operations failed')
    expect(parseSseEvents(response.body)).toEqual([])
    const records = await repository.readClientMessages(project.id)
    expect(records).toContainEqual(
      expect.objectContaining({ dir: 'in', type: 'prompt' }),
    )
    expect(records).not.toContainEqual(
      expect.objectContaining({ dir: 'out', event: 'text' }),
    )
  })

  it('drains queued events before release when finalization throws', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    async function* textStream() {
      yield { payload: { text: 'queued' }, type: 'text-delta' }
    }
    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async () => fakeAgentStream(textStream()),
      }),
    }))

    const fixture = await getRuntimeFixture()
    const { repository } = fixture.runtime
    const project = await repository.createProject()
    createdProjectIds.push(project.id)
    const append = repository.appendClientMessage.bind(repository)
    const appendEntered = deferred<void>()
    const releaseAppend = deferred<void>()
    const terminalProjectionEntered = deferred<void>()
    let pauseFirstOutput = true
    vi.spyOn(repository, 'appendClientMessage').mockImplementation(
      async (id, entry) => {
        if (entry.dir === 'out' && pauseFirstOutput) {
          pauseFirstOutput = false
          appendEntered.resolve()
          await releaseAppend.promise
        }
        return append(id, entry)
      },
    )
    const setRunStatus = repository.setRunStatusSync.bind(repository)
    vi.spyOn(repository, 'setRunStatusSync').mockImplementation((id, state) => {
      if (state.finishedAt) {
        terminalProjectionEntered.resolve()
        throw new Error('terminal projection failed')
      }
      return setRunStatus(id, state)
    })
    const response = new FakeResponse()
    const runner = await getTestRunner()

    await expect(
      runner.start({
        baseUrl: 'http://localhost:3001',
        projectId: project.id,
        prompt: 'Drain the queue.',
        subscriber: response as unknown as ServerResponse,
        textModel: 'z-ai/glm-5.2',
      }),
    ).resolves.toMatchObject({ ok: true })
    await appendEntered.promise

    let idleSettled = false
    const idle = runner.waitForIdle().finally(() => {
      idleSettled = true
    })
    await Promise.resolve()
    expect(fixture.runtime.runBus.getRun(project.id)).toBeDefined()
    expect(idleSettled).toBe(false)
    releaseAppend.resolve()
    await terminalProjectionEntered.promise
    await expect(idle).resolves.toBeUndefined()
    expect(fixture.runtime.runBus.getRun(project.id)).toBeUndefined()
    expect(parseSseEvents(response.body).at(-1)).toEqual({
      data: {},
      event: 'done',
    })
    await expect(repository.readClientMessages(project.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: 'run_terminal' }),
      ]),
    )
  })
})

describe('streamLandingAgent attachments', () => {
  it('analyzes attachments before the agent run and persists tool metadata', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')

    let capturedInput: unknown
    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async (messages: unknown) => {
          capturedInput = messages
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

    const { createProject, getProject } = (await getRuntimeFixture()).runtime
      .repository
    const project = await createProject()
    createdProjectIds.push(project.id)
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
      projectId: project.id,
      prompt: 'Use this reference image.',
      request: fakeRequest(),
      response: response as unknown as ServerResponse,
      textModel: 'z-ai/glm-5.2',
    })

    // Fallback mode: the single new message is a plain string carrying the
    // prompt + OCR transcript (memory thread owns prior history).
    expect(typeof capturedInput).toBe('string')
    expect(capturedInput as string).toContain('Use this reference image.')
    expect(capturedInput as string).toContain(
      'Attached image OCR/visual transcript',
    )
    expect(capturedInput as string).toContain('Headline: Ship a sharper page')
    expect(capturedInput as string).toContain(
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

  it('attaches images directly to the user message when the model supports image input', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')

    let capturedInput: unknown
    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async (messages: unknown) => {
          capturedInput = messages
          return fakeAgentStream()
        },
      }),
    }))

    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = String(input)
      if (url.includes('/models')) {
        return jsonResponse({
          data: [
            {
              architecture: { input_modalities: ['text', 'image'] },
              id: 'acme/vision-chat',
            },
          ],
        })
      }
      if (url.includes('/generation')) return jsonResponse({ data: {} })
      throw new Error(`Unexpected fetch in direct mode: ${url}`)
    })
    vi.stubGlobal('fetch', fetch)

    const { createProject, getProject } = (await getRuntimeFixture()).runtime
      .repository
    const project = await createProject()
    createdProjectIds.push(project.id)
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
      projectId: project.id,
      prompt: 'Use this reference image.',
      request: fakeRequest(),
      response: response as unknown as ServerResponse,
      textModel: 'acme/vision-chat:nitro',
    })

    // Current prompt rides as the single new message: a multimodal user
    // message with text + image part.
    const current = capturedInput as { content: unknown; role: string }
    expect(current.role).toBe('user')
    expect(Array.isArray(current.content)).toBe(true)
    const parts = current.content as Array<{
      image?: string
      text?: string
      type: string
    }>
    expect(parts[0]).toMatchObject({ type: 'text' })
    expect(parts[0]?.text).toContain('Use this reference image.')
    expect(parts[0]?.text).toContain('wireframe.png')
    expect(parts[1]).toEqual({ image: PNG_DATA_URL, type: 'image' })

    // No vision OCR call was made — only the model catalog fetch.
    for (const call of fetch.mock.calls) {
      expect(String(call[0])).not.toContain('/chat/completions')
    }

    const events = parseSseEvents(response.body)
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            result: 'Attached 1 image to the model',
            state: 'done',
            tool: 'analyze_image',
          }),
          event: 'tool_call',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            costBreakdown: expect.objectContaining({
              vision: { calls: 0, cost: 0, images: 0 },
            }),
          }),
          event: 'stats',
        }),
      ]),
    )

    const saved = await getProject(project.id)
    expect(JSON.stringify(saved?.messages[0])).not.toContain(PNG_DATA_URL)
  })

  it('records attachment analysis failures without blocking the agent run', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')

    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./lib/image-ocr.ts', () => ({
      ocrImageInputs: vi.fn<
        () => Promise<{
          imagesAnalyzed: number
          ok: boolean
          reason: string
          text: string
          usage: null
        }>
      >(async () => ({
        imagesAnalyzed: 1,
        ok: false,
        reason: 'vision unavailable',
        text: '',
        usage: null,
      })),
    }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async () => fakeAgentStream(),
      }),
    }))

    const { createProject, getProject } = (await getRuntimeFixture()).runtime
      .repository
    const project = await createProject()
    createdProjectIds.push(project.id)
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
      projectId: project.id,
      prompt: 'Use this reference image.',
      request: fakeRequest(),
      response: response as unknown as ServerResponse,
      textModel: 'z-ai/glm-5.2',
    })

    expect(parseSseEvents(response.body)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            result: 'vision unavailable',
            state: 'error',
            tool: 'analyze_image',
          }),
          event: 'tool_call',
        }),
      ]),
    )
    await expect(getProject(project.id)).resolves.toMatchObject({
      messages: [
        expect.objectContaining({
          attachments: [
            expect.not.objectContaining({ analysisText: expect.any(String) }),
          ],
        }),
      ],
    })
  })

  it('gracefully stops while attachment OCR is waiting on the provider', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')

    const stream = vi.fn<() => Promise<ReturnType<typeof fakeAgentStream>>>(
      async () => fakeAgentStream(),
    )
    vi.doUnmock('./lib/image-ocr.ts')
    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({ stream }),
    }))
    const fetch = vi.fn<typeof globalThis.fetch>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason),
            {
              once: true,
            },
          )
        }),
    )
    vi.stubGlobal('fetch', fetch)

    const { createProject } = (await getRuntimeFixture()).runtime.repository
    const project = await createProject()
    createdProjectIds.push(project.id)
    const stopLandingAgent = (await getTestRunner()).stop
    const request = fakeRequest()
    const response = new FakeResponse()

    const running = streamLandingAgent({
      attachments: [
        {
          dataUrl: PNG_DATA_URL,
          id: 'image-1',
          mediaType: 'image/png',
          name: 'wireframe.png',
          size: 68,
        },
      ],
      projectId: project.id,
      prompt: 'Use this reference image.',
      request,
      response: response as unknown as ServerResponse,
      textModel: 'z-ai/glm-5.2',
    })
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())

    await expect(stopLandingAgent(project.id)).resolves.toMatchObject({
      stopped: true,
    })
    await running

    expect(stream).not.toHaveBeenCalled()
    expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
    expect(request.listenerCount('close')).toBe(0)
    expect(parseSseEvents(response.body).slice(-3)).toEqual([
      expect.objectContaining({ event: 'stats' }),
      { data: { message: 'stopped' }, event: 'error' },
      { data: {}, event: 'done' },
    ])
  })
})

describe('streamLandingAgent error handling', () => {
  it('streams model errors and persists the failed turn', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')

    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async () => {
          throw new Error('model exploded')
        },
      }),
    }))

    const { createProject, getProject } = (await getRuntimeFixture()).runtime
      .repository
    const project = await createProject()
    createdProjectIds.push(project.id)
    const response = new FakeResponse()

    await streamLandingAgent({
      projectId: project.id,
      prompt: 'Trigger an error.',
      request: fakeRequest(),
      response: response as unknown as ServerResponse,
      textModel: 'z-ai/glm-5.2',
    })

    expect(parseSseEvents(response.body)).toEqual(
      expect.arrayContaining([
        { data: { message: 'model exploded' }, event: 'error' },
        { data: {}, event: 'done' },
      ]),
    )
    await expect(getProject(project.id)).resolves.toMatchObject({
      messages: [expect.objectContaining({ error: 'model exploded' })],
    })
  })

  it('records cost/stats and raw messages even when a fatal error aborts the run', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')

    const ASSISTANT_RAW = {
      content: {
        format: 2,
        parts: [{ text: 'partial.', type: 'text' }],
      },
      id: 'mastra-partial-1',
      role: 'assistant',
    }
    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async () =>
          fakeAgentStream(editToolStream({ isError: true }), undefined, {
            messageList: {
              get: { response: { db: () => [ASSISTANT_RAW] } },
            },
          }),
      }),
    }))

    const { createProject, getProject, readAgentMessages } = (
      await getRuntimeFixture()
    ).runtime.repository
    const project = await createProject()
    createdProjectIds.push(project.id)
    const response = new FakeResponse()

    await streamLandingAgent({
      projectId: project.id,
      prompt: 'Build it.',
      request: fakeRequest(),
      response: response as unknown as ServerResponse,
      textModel: 'z-ai/glm-5.2',
    })

    const events = parseSseEvents(response.body)
    // A stats event is still emitted despite the failed edit run.
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            cost: expect.any(Number),
            costBreakdown: expect.any(Object),
            model: 'z-ai/glm-5.2',
          }),
          event: 'stats',
        }),
      ]),
    )
    const saved = await getProject(project.id)
    // The persisted failed turn carries a stats part.
    expect(saved?.messages[0]?.parts).toContainEqual(
      expect.objectContaining({ type: 'stats' }),
    )
    // Raw response messages are captured even though the run did not complete
    // a clean success path (final agent-message snapshot at run end).
    const agentEntries = await readAgentMessages(project.id)
    expect(agentEntries.at(-1)).toMatchObject({
      messages: [ASSISTANT_RAW],
      turnId: expect.stringMatching(/^turn-/),
    })
  })
})

describe('streamLandingAgent cost accounting', () => {
  it('uses provider-reported LLM cost from raw stream chunks', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')

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

    const { createProject } = (await getRuntimeFixture()).runtime.repository
    const project = await createProject()
    createdProjectIds.push(project.id)
    const response = new FakeResponse()

    await streamLandingAgent({
      projectId: project.id,
      prompt: 'Test provider cost.',
      request: fakeRequest(),
      response: response as unknown as ServerResponse,
      textModel: 'z-ai/glm-5.2',
    })

    expect(capturedOptions).toMatchObject({
      includeRawChunks: true,
      maxProcessorRetries: 10,
      modelSettings: { maxOutputTokens: 16_384, maxRetries: 0 },
    })
    const errorProcessors = capturedOptions?.errorProcessors as
      | Array<{ id: string }>
      | undefined
    expect(errorProcessors?.[0]?.id).toBe('landing-agent-retry-processor')
    const events = parseSseEvents(response.body)
    expect(events).toEqual(
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
    const liveStatsIndex = events.findIndex(
      ({ data, event }) =>
        event === 'stats' &&
        isRecord(data) &&
        data.finishReason === 'in-progress' &&
        data.cost === 0.0123,
    )
    const terminalStatsIndex = events.findLastIndex(
      ({ data, event }) =>
        event === 'stats' && isRecord(data) && data.finishReason === 'stop',
    )
    expect(liveStatsIndex).toBeGreaterThanOrEqual(0)
    expect(liveStatsIndex).toBeLessThan(terminalStatsIndex)
  })

  it('streams cumulative token usage after each completed LLM step', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')

    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async () =>
          fakeAgentStream(liveUsageStepFinishStream(), {
            cachedInputTokens: 3,
            inputTokens: 23,
            outputTokens: 8,
            totalTokens: 31,
          }),
      }),
    }))

    const { createProject } = (await getRuntimeFixture()).runtime.repository
    const project = await createProject()
    createdProjectIds.push(project.id)
    const response = new FakeResponse()

    await streamLandingAgent({
      projectId: project.id,
      prompt: 'Stream usage.',
      request: fakeRequest(),
      response: response as unknown as ServerResponse,
      textModel: 'z-ai/glm-5.2',
    })

    expect(parseSseEvents(response.body)).toContainEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          finishReason: 'in-progress',
          usage: {
            cachedInputTokens: 3,
            inputTokens: 23,
            outputTokens: 8,
            totalTokens: 31,
          },
        }),
        event: 'stats',
      }),
    )
  })

  it('sums provider-reported cost across every LLM step', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')

    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async () =>
          fakeAgentStream(multiStepRawCostStream(), {
            cachedInputTokens: 10,
            inputTokens: 100,
            outputTokens: 20,
            totalTokens: 120,
          }),
      }),
    }))

    const { createProject } = (await getRuntimeFixture()).runtime.repository
    const project = await createProject()
    createdProjectIds.push(project.id)
    const response = new FakeResponse()

    await streamLandingAgent({
      projectId: project.id,
      prompt: 'Test multi-step provider cost.',
      request: fakeRequest(),
      response: response as unknown as ServerResponse,
      textModel: 'z-ai/glm-5.2',
    })

    expect(parseSseEvents(response.body)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            cost: 0.016,
            costBreakdown: expect.objectContaining({ llm: 0.016 }),
          }),
          event: 'stats',
        }),
      ]),
    )
  })

  it('aborts the run when accumulated cost exceeds the cap', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    vi.stubEnv('AGENT_MAX_COST_USD', '0.01')

    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async () =>
          fakeAgentStream(rawCostStream(), {
            cachedInputTokens: 0,
            inputTokens: 23,
            outputTokens: 8,
            totalTokens: 31,
          }),
      }),
    }))

    const { createProject } = (await getRuntimeFixture()).runtime.repository
    const project = await createProject()
    createdProjectIds.push(project.id)
    const response = new FakeResponse()

    await streamLandingAgent({
      projectId: project.id,
      prompt: 'Trip the cost cap.',
      request: fakeRequest(),
      response: response as unknown as ServerResponse,
      textModel: 'z-ai/glm-5.2',
    })

    expect(parseSseEvents(response.body)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            message: 'Run exceeded the $0.01 cost cap.',
          }),
          event: 'error',
        }),
      ]),
    )
  })

  it('reports zero LLM cost when OpenRouter cost metadata is absent', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')

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

    const { createProject } = (await getRuntimeFixture()).runtime.repository
    const project = await createProject()
    createdProjectIds.push(project.id)
    const response = new FakeResponse()

    await streamLandingAgent({
      projectId: project.id,
      prompt: 'Test metadata-only cost.',
      request: fakeRequest(),
      response: response as unknown as ServerResponse,
      textModel: 'z-ai/glm-5.2',
    })

    expect(parseSseEvents(response.body)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            cost: 0,
            costBreakdown: expect.objectContaining({
              llm: 0,
            }),
          }),
          event: 'stats',
        }),
      ]),
    )
  })
})

describe('streamLandingAgent stream mapping', () => {
  it('maps text and tool summaries without recounting result payload costs', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')

    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async () =>
          fakeAgentStream(mixedToolStream(), {
            cachedInputTokens: 10,
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
          }),
      }),
    }))

    const { createProject, getProject } = (await getRuntimeFixture()).runtime
      .repository
    const project = await createProject()
    createdProjectIds.push(project.id)
    const response = new FakeResponse()

    await streamLandingAgent({
      projectId: project.id,
      prompt: 'Map stream chunks.',
      request: fakeRequest(),
      response: response as unknown as ServerResponse,
      textModel: 'z-ai/glm-5.2',
    })

    const events = parseSseEvents(response.body)
    expect(events).toEqual(
      expect.arrayContaining([
        { data: { delta: 'Thinking.' }, event: 'thinking' },
        { data: { delta: 'Done.' }, event: 'text' },
        expect.objectContaining({
          data: expect.objectContaining({
            detail: expect.stringContaining('Aspect ratio: 1:1'),
            result: expect.stringContaining('Generated 2 images'),
            state: 'done',
            tool: 'generate_image',
          }),
          event: 'tool_call',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            result: 'Example · 123 chars · 2 links · 3 images · OCR 2 images',
            state: 'done',
            tool: 'scrape',
          }),
          event: 'tool_call',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            result: '2 matches · truncated',
            state: 'done',
            tool: 'find',
          }),
          event: 'tool_call',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            result: 'Read 25 lines of 100',
            state: 'done',
            tool: 'read',
          }),
          event: 'tool_call',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            result: 'Boom',
            state: 'error',
            tool: 'skill_read',
          }),
          event: 'tool_call',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            cost: 0,
            costBreakdown: expect.objectContaining({
              image: expect.objectContaining({ cost: 0, count: 0 }),
              llm: 0,
              scrape: expect.objectContaining({
                calls: 0,
                cost: 0,
                credits: 0,
                firecrawlCost: 0,
                ocrCost: 0,
                ocrImages: 0,
              }),
            }),
            finishReason: 'stop',
          }),
          event: 'stats',
        }),
      ]),
    )

    for (const tool of [
      'generate_image',
      'scrape',
      'find',
      'read',
      'skill_read',
    ]) {
      const toolResultIndex = events.findIndex(
        ({ data, event }) =>
          event === 'tool_call' &&
          isRecord(data) &&
          data.tool === tool &&
          (data.state === 'done' || data.state === 'error'),
      )
      expect(toolResultIndex).toBeGreaterThanOrEqual(0)
      expect(events[toolResultIndex + 1]).toEqual(
        expect.objectContaining({
          data: expect.objectContaining({ finishReason: 'in-progress' }),
          event: 'stats',
        }),
      )
    }

    const saved = await getProject(project.id)
    expect(saved?.messages[0]?.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: 'Thinking.', type: 'thinking' }),
        expect.objectContaining({ text: 'Done.', type: 'text' }),
        expect.objectContaining({ state: 'error', tool: 'skill_read' }),
      ]),
    )
  })
})

describe('streamLandingAgent generated image persistence', () => {
  it('does not late-persist generated image bytes from a tool result', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')

    const { saveImage } = (await getRuntimeFixture()).runtime.imageStore
    const imageId = saveImage(
      Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      'image/jpeg',
    )

    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async () =>
          fakeAgentStream(
            (async function* () {
              yield {
                payload: {
                  args: { action: 'Hero image', prompt: 'Studio shot' },
                  toolCallId: 'call-img-persist',
                  toolName: 'generate_image',
                },
                type: 'tool-call',
              }
              yield {
                payload: {
                  args: { action: 'Hero image' },
                  isError: false,
                  result: {
                    cost: 0.04,
                    imagesGenerated: 1,
                    ok: true,
                    url: `http://localhost:3001/images/${imageId}.jpg`,
                  },
                  toolCallId: 'call-img-persist',
                  toolName: 'generate_image',
                },
                type: 'tool-result',
              }
            })(),
          ),
      }),
    }))

    const { createProject, readProjectImage } = (await getRuntimeFixture())
      .runtime.repository
    const project = await createProject()
    createdProjectIds.push(project.id)

    await streamLandingAgent({
      projectId: project.id,
      prompt: 'Build it.',
      request: fakeRequest(),
      response: new FakeResponse() as unknown as ServerResponse,
      textModel: 'z-ai/glm-5.2',
    })

    // Provider tools persist before returning success. Replaying a result must
    // not perform a late write after provider operation ownership has ended.
    await expect(
      readProjectImage(project.id, `${imageId}.jpg`),
    ).resolves.toBeNull()
  })
})

describe('provider operation and metadata fences', () => {
  it.each(['metadata-first', 'provider-first'] as const)(
    'retains late provider and LLM usage when %s settles first',
    async (order) => {
      vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
      vi.stubEnv('PROVIDER_DRAIN_GRACE_MS', '5')
      vi.stubEnv('PROVIDER_METADATA_TIMEOUT_MS', '5')
      vi.stubEnv('PROVIDER_OPERATION_TIMEOUT_MS', '1000')
      const providerEntered = deferred<void>()
      const releaseProvider = deferred<void>()
      const delayedUsage = deferred<{
        inputTokens: number
        outputTokens: number
        totalTokens: number
      }>()
      vi.doMock('./index.ts', () => ({ mastra: {} }))
      vi.doMock('./agents/landing-page-agent.ts', () => ({
        createLandingPageAgent: (
          _store: unknown,
          _mastra: unknown,
          _memory: unknown,
          _baseUrl: string,
          options: { operations?: OperationScope },
        ) => ({
          stream: async () => {
            void options.operations
              ?.run('late-image-charge', async (operation) => {
                providerEntered.resolve()
                await releaseProvider.promise
                operation.reportUsage({
                  amount: 0.4,
                  category: 'image',
                  count: 1,
                  reportId: 'late-response',
                  source: 'generation',
                  unit: 'usd',
                })
              })
              .catch(() => {})
            return fakeAgentStream(rawCostStream(), undefined, {
              usage:
                order === 'metadata-first'
                  ? Promise.resolve({
                      inputTokens: 9,
                      outputTokens: 4,
                      totalTokens: 13,
                    })
                  : delayedUsage.promise,
            })
          },
        }),
      }))

      const fixture = await getRuntimeFixture()
      const project = await fixture.runtime.repository.createProject()
      createdProjectIds.push(project.id)
      const runner = await getTestRunner()
      const response = new FakeResponse()
      await runner.start({
        baseUrl: 'http://localhost:3001',
        projectId: project.id,
        prompt: 'Settle all known usage.',
        subscriber: response as unknown as ServerResponse,
        textModel: 'z-ai/glm-5.2',
        turnId: `turn-${order}`,
      })
      await providerEntered.promise
      await vi.waitFor(() => {
        expect(parseSseEvents(response.body)).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ event: 'run_blocked' }),
          ]),
        )
      })

      releaseProvider.resolve()
      if (order === 'provider-first') {
        await Promise.resolve()
        delayedUsage.resolve({
          inputTokens: 9,
          outputTokens: 4,
          totalTokens: 13,
        })
      }
      await vi.waitFor(() => {
        expect(fixture.runtime.runBus.getRun(project.id)).toBeUndefined()
      })
      const journal = await fixture.runtime.repository.readClientJournal(
        project.id,
      )
      expect(
        journal.records.find((record) => record.event === 'run_terminal')
          ?.payload,
      ).toMatchObject({
        outcome: 'error',
        stats: {
          cost: 0.4123,
          costBreakdown: {
            image: { cost: 0.4, count: 1 },
            llm: 0.0123,
          },
          usage: { totalTokens: 13 },
        },
      })
    },
  )

  it('drains and fences an abort-ignoring capability lookup before agent creation', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    vi.stubEnv('PROVIDER_DRAIN_GRACE_MS', '5')
    vi.stubEnv('PROVIDER_OPERATION_TIMEOUT_MS', '20')
    const fetch = vi.fn<typeof globalThis.fetch>(
      () => new Promise<Response>(() => {}),
    )
    testCapabilities = createModelCapabilities({
      apiKey: 'test-openrouter-key',
      chatApiUrl: 'https://openrouter.example.test/api/v1',
      transport: createProviderTransport({ fetch }),
    })
    const stream = vi.fn<() => Promise<ReturnType<typeof fakeAgentStream>>>(
      async () => fakeAgentStream(),
    )
    const createLandingPageAgent = vi.fn<() => { stream: typeof stream }>(
      () => ({ stream }),
    )
    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent,
    }))

    const fixture = await getRuntimeFixture()
    const project = await fixture.runtime.repository.createProject()
    createdProjectIds.push(project.id)
    const runner = await getTestRunner()
    await runner.start({
      baseUrl: 'http://localhost:3001',
      projectId: project.id,
      prompt: 'Resolve capability.',
      textModel: 'z-ai/glm-5.2',
    })

    await expect(runner.waitForIdle()).rejects.toThrow(
      'Landing agent runner operations failed',
    )
    expectedBlockedRunner = true
    expect(fetch).toHaveBeenCalledOnce()
    expect(createLandingPageAgent).not.toHaveBeenCalled()
    expect(fixture.runtime.runBus.getRun(project.id)).toBeDefined()
  })

  it('keeps run ownership when an abort-ignoring provider operation cannot drain', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    vi.stubEnv('PROVIDER_DRAIN_GRACE_MS', '5')
    vi.stubEnv('PROVIDER_OPERATION_TIMEOUT_MS', '20')
    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: (
        _store: unknown,
        _mastra: unknown,
        _memory: unknown,
        _baseUrl: string,
        options: { operations?: OperationScope },
      ) => ({
        stream: async () => {
          void options.operations?.run(
            'abort-ignoring-provider',
            () => new Promise<never>(() => {}),
          )
          return fakeAgentStream()
        },
      }),
    }))

    const fixture = await getRuntimeFixture()
    const project = await fixture.runtime.repository.createProject()
    createdProjectIds.push(project.id)
    const runner = await getTestRunner()
    const response = new FakeResponse()

    await expect(
      runner.start({
        baseUrl: 'http://localhost:3001',
        projectId: project.id,
        prompt: 'Start bounded work.',
        subscriber: response as unknown as ServerResponse,
        textModel: 'z-ai/glm-5.2',
      }),
    ).resolves.toMatchObject({ ok: true })
    await expect(runner.waitForIdle()).rejects.toThrow(
      'Landing agent runner operations failed',
    )
    expectedBlockedRunner = true

    expect(fixture.runtime.runBus.getRun(project.id)).toBeDefined()
    await expect(
      runner.start({
        baseUrl: 'http://localhost:3001',
        projectId: project.id,
        prompt: 'Do not overlap.',
        textModel: 'z-ai/glm-5.2',
      }),
    ).resolves.toEqual({ ok: false, reason: 'overlap' })
    await expect(
      fixture.runtime.repository.getProject(project.id),
    ).resolves.toMatchObject({ runBlocked: true, status: 'error' })
    const events = parseSseEvents(response.body)
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            knownUsage: expect.objectContaining({
              finishReason: 'incomplete',
            }),
            reason: expect.stringContaining('drain grace period'),
          }),
          event: 'run_blocked',
        }),
      ]),
    )
    expect(events).not.toContainEqual(
      expect.objectContaining({ event: 'done' }),
    )
  })

  it('retains fulfilled usage and fences the run when finish metadata hangs', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    vi.stubEnv('PROVIDER_METADATA_TIMEOUT_MS', '5')
    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async () =>
          fakeAgentStream(emptyFullStream(), undefined, {
            finishReason: new Promise<never>(() => {}),
            usage: Promise.resolve({
              inputTokens: 9,
              outputTokens: 4,
              totalTokens: 13,
            }),
          }),
      }),
    }))

    const fixture = await getRuntimeFixture()
    const project = await fixture.runtime.repository.createProject()
    createdProjectIds.push(project.id)
    const runner = await getTestRunner()
    const response = new FakeResponse()
    await runner.start({
      baseUrl: 'http://localhost:3001',
      projectId: project.id,
      prompt: 'Bound metadata.',
      subscriber: response as unknown as ServerResponse,
      textModel: 'z-ai/glm-5.2',
    })

    await expect(runner.waitForIdle()).rejects.toThrow(
      'Landing agent runner operations failed',
    )
    expectedBlockedRunner = true
    const events = parseSseEvents(response.body)
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            knownUsage: expect.objectContaining({
              usage: expect.objectContaining({ totalTokens: 13 }),
            }),
            reason:
              'Final provider usage metadata did not settle before its deadline.',
          }),
          event: 'run_blocked',
        }),
      ]),
    )
    expect(events).not.toContainEqual(
      expect.objectContaining({ event: 'done' }),
    )
    expect(fixture.runtime.runBus.getRun(project.id)).toBeDefined()
  })

  it('waits through the metadata deadline when usage rejects and finish never settles', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    vi.stubEnv('PROVIDER_METADATA_TIMEOUT_MS', '5')
    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async () =>
          fakeAgentStream(emptyFullStream(), undefined, {
            finishReason: new Promise<never>(() => {}),
            usage: Promise.reject(new Error('usage unavailable')),
          }),
      }),
    }))

    const fixture = await getRuntimeFixture()
    const project = await fixture.runtime.repository.createProject()
    createdProjectIds.push(project.id)
    const runner = await getTestRunner()
    await runner.start({
      baseUrl: 'http://localhost:3001',
      projectId: project.id,
      prompt: 'Reject one metadata field.',
      textModel: 'z-ai/glm-5.2',
    })

    await expect(runner.waitForIdle()).rejects.toThrow(
      'Landing agent runner operations failed',
    )
    expectedBlockedRunner = true
    expect(fixture.runtime.runBus.getRun(project.id)).toBeDefined()
  })
})

describe('streamLandingAgent edit stream', () => {
  it('renders an edit call as one running + one done block with the call action', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')

    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async () =>
          fakeAgentStream(
            (async function* () {
              yield {
                payload: {
                  args: {
                    action: 'Rewrite headline',
                    diff: '[index.html#1A2B]\nSWAP 2.=2:\n  <h1>Hi</h1>',
                  },
                  toolCallId: 'call-edit-1',
                  toolName: 'edit',
                },
                type: 'tool-call',
              }
              yield {
                payload: {
                  args: {
                    action: 'Rewrite headline',
                    diff: '[index.html#1A2B]\nSWAP 2.=2:\n  <h1>Hi</h1>',
                  },
                  isError: false,
                  result: {
                    bytes: 128,
                    diffPreview: '-   <h1>Old</h1>\n+   <h1>Hi</h1>',
                    firstChangedLine: 2,
                    header: '[index.html#3C4D]',
                    ok: true,
                    tag: '3C4D',
                    warnings: [],
                  },
                  toolCallId: 'call-edit-1',
                  toolName: 'edit',
                },
                type: 'tool-result',
              }
            })(),
          ),
      }),
    }))

    const { createProject, getProject } = (await getRuntimeFixture()).runtime
      .repository
    const project = await createProject()
    createdProjectIds.push(project.id)
    const response = new FakeResponse()

    await streamLandingAgent({
      projectId: project.id,
      prompt: 'Build it.',
      request: fakeRequest(),
      response: response as unknown as ServerResponse,
      textModel: 'z-ai/glm-5.2',
    })

    const editEvents = parseSseEvents(response.body).filter(
      (event) =>
        event.event === 'tool_call' &&
        !!event.data &&
        typeof event.data === 'object' &&
        'tool' in event.data &&
        event.data.tool === 'edit',
    )
    // One running + one done — a hashline edit is one diff per call (1:1, no fan-out).
    expect(editEvents).toHaveLength(2)
    const running = editEvents.filter(
      (event) => (event.data as { state?: string }).state === 'running',
    )
    const done = editEvents.filter(
      (event) => (event.data as { state?: string }).state === 'done',
    )
    expect(running).toHaveLength(1)
    expect(done).toHaveLength(1)
    // Same id for both blocks; the call's top-level action is surfaced.
    const ids = editEvents.map((event) => (event.data as { id?: string }).id)
    expect(new Set(ids).size).toBe(1)
    for (const event of editEvents) {
      expect((event.data as { action?: string }).action).toBe(
        'Rewrite headline',
      )
    }
    // The persisted turn has one edit tool_call part.
    const saved = await getProject(project.id)
    const editParts = (saved?.messages[0]?.parts ?? []).filter(
      (part) => part.type === 'tool_call' && part.tool === 'edit',
    )
    expect(editParts).toHaveLength(1)
  })
})

describe('streamLandingAgent default tool intents', () => {
  it('derives intents for skill and skill_read calls without an action arg', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')

    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async () =>
          fakeAgentStream(
            (async function* () {
              yield {
                payload: {
                  args: { name: 'design' },
                  toolCallId: 'call-skill-1',
                  toolName: 'skill',
                },
                type: 'tool-call',
              }
              yield {
                payload: {
                  args: { name: 'design' },
                  toolCallId: 'call-skill-1',
                  toolName: 'skill',
                },
                type: 'tool-result',
              }
              yield {
                payload: {
                  args: { path: 'color.md', skillName: 'design' },
                  toolCallId: 'call-skill-read-1',
                  toolName: 'skill_read',
                },
                type: 'tool-call',
              }
              yield {
                payload: {
                  args: { path: 'color.md', skillName: 'design' },
                  toolCallId: 'call-skill-read-1',
                  toolName: 'skill_read',
                },
                type: 'tool-result',
              }
            })(),
          ),
      }),
    }))

    const { createProject } = (await getRuntimeFixture()).runtime.repository
    const project = await createProject()
    createdProjectIds.push(project.id)
    const response = new FakeResponse()

    await streamLandingAgent({
      projectId: project.id,
      prompt: 'Build it.',
      request: fakeRequest(),
      response: response as unknown as ServerResponse,
      textModel: 'z-ai/glm-5.2',
    })

    const toolCalls = parseSseEvents(response.body).filter(
      (event) => event.event === 'tool_call',
    )
    const skillCall = toolCalls.find(
      (event) =>
        !!event.data &&
        typeof event.data === 'object' &&
        'tool' in event.data &&
        event.data.tool === 'skill',
    )
    const skillReadCall = toolCalls.find(
      (event) =>
        !!event.data &&
        typeof event.data === 'object' &&
        'tool' in event.data &&
        event.data.tool === 'skill_read',
    )
    expect((skillCall?.data as undefined | { action?: string })?.action).toBe(
      'Load skill: design',
    )
    expect(
      (skillReadCall?.data as undefined | { action?: string })?.action,
    ).toBe('Read design reference: color.md')
  })
})

describe('streamLandingAgent retries', () => {
  it('emits retry events with issue, attempt, max attempts, and delay', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
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

    const { createProject } = (await getRuntimeFixture()).runtime.repository
    const project = await createProject()
    createdProjectIds.push(project.id)
    const response = new FakeResponse()

    await streamLandingAgent({
      projectId: project.id,
      prompt: 'Test visible retry.',
      request: fakeRequest(),
      response: response as unknown as ServerResponse,
      textModel: 'z-ai/glm-5.2',
    })

    expect(parseSseEvents(response.body)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: {
            attempt: 1,
            delayMs: 0,
            issue: 'ECONNRESET',
            maxAttempts: 10,
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
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')

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

    const { createProject, getProject, readClientMessages } = (
      await getRuntimeFixture()
    ).runtime.repository
    const project = await createProject()
    createdProjectIds.push(project.id)
    const response = new FakeResponse()

    await streamLandingAgent({
      projectId: project.id,
      prompt: 'Update the hero.',
      request: fakeRequest(),
      response: response as unknown as ServerResponse,
      textModel: 'z-ai/glm-5.2',
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

    // html_update is broadcast live but NOT appended to the durable log — it
    // carries full HTML, the reducer ignores it, and terminal HTML already
    // lives in html.json. Logging it would only bloat the single source of truth.
    const logged = await readClientMessages(project.id)
    expect(
      logged.filter((entry) => entry.event === 'html_update'),
    ).toHaveLength(0)
  })

  it('does not emit html_update for failed edits', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')

    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async () =>
          fakeAgentStream(
            editToolStream({ callId: 'call-edit-failed', isError: true }),
          ),
      }),
    }))

    const { createProject } = (await getRuntimeFixture()).runtime.repository
    const project = await createProject()
    createdProjectIds.push(project.id)
    const response = new FakeResponse()

    await streamLandingAgent({
      projectId: project.id,
      prompt: 'Try an edit.',
      request: fakeRequest(),
      response: response as unknown as ServerResponse,
      textModel: 'z-ai/glm-5.2',
    })

    expect(htmlUpdateEvents(response.body)).toEqual([])
  })

  it('marks malformed edit results and empty draft output as errors', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')

    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async () =>
          fakeAgentStream(
            editToolStream({ hasResultOverride: true, result: null }),
          ),
      }),
    }))

    const { createProject, getProject } = (await getRuntimeFixture()).runtime
      .repository
    const project = await createProject()
    createdProjectIds.push(project.id)
    const response = new FakeResponse()

    await streamLandingAgent({
      projectId: project.id,
      prompt: 'Create a complete landing page.',
      request: fakeRequest(),
      response: response as unknown as ServerResponse,
      textModel: 'nvidia/nemotron-3-ultra-550b-a55b',
    })

    const events = parseSseEvents(response.body)
    expect(htmlUpdateEvents(response.body)).toEqual([])
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            result: expect.stringContaining('edit was malformed'),
            state: 'error',
            tool: 'edit',
          }),
          event: 'tool_call',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            model: 'nvidia/nemotron-3-ultra-550b-a55b',
          }),
          event: 'stats',
        }),
        expect.objectContaining({
          data: {
            message: expect.stringContaining('without generating project HTML'),
          },
          event: 'error',
        }),
        { data: {}, event: 'done' },
      ]),
    )

    const saved = await getProject(project.id)
    expect(saved).toMatchObject({
      hasHtml: false,
      indexHtml: expect.stringContaining('Your landing page will appear here.'),
    })
    expect(saved?.messages[0]?.error).toContain(
      'without generating project HTML',
    )
    expect(saved?.messages[0]?.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          result: expect.stringContaining('edit was malformed'),
          state: 'error',
          tool: 'edit',
          type: 'tool_call',
        }),
      ]),
    )
  })

  it('lets the model recover from a failed edit instead of aborting the run', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')

    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async () =>
          fakeAgentStream(
            (async function* () {
              // First edit fails (bad range), then the model retries the edit
              // immediately WITHOUT an intervening read. Previously this
              // second edit tripped the editRequiresInspection guard and
              // aborted the whole run; now it runs normally.
              yield* editToolStream({ callId: 'call-edit-fail', isError: true })
              yield* editToolStream({ callId: 'call-edit-retry' })
            })(),
          ),
      }),
    }))

    const { createProject } = (await getRuntimeFixture()).runtime.repository
    const project = await createProject()
    createdProjectIds.push(project.id)
    const response = new FakeResponse()

    await streamLandingAgent({
      projectId: project.id,
      prompt: 'Build it.',
      request: fakeRequest(),
      response: response as unknown as ServerResponse,
      textModel: 'z-ai/glm-5.2',
    })

    const events = parseSseEvents(response.body)
    const isToolCall = (event: {
      data: unknown
      event: string
    }): event is { data: { tool: string }; event: 'tool_call' } =>
      event.event === 'tool_call' &&
      !!event.data &&
      typeof event.data === 'object' &&
      'tool' in event.data
    const isError = (event: {
      data: unknown
      event: string
    }): event is { data: { message: string }; event: 'error' } =>
      event.event === 'error' &&
      !!event.data &&
      typeof event.data === 'object' &&
      'message' in event.data
    // The second edit must produce a tool_call event in the running/done path,
    // not abort the run. There must be NO fatal 'error' event from a
    // read-before-retry guard (the only error may be the NO_GENERATED_HTML
    // completion guard, which is absent here because html_update fires).
    const editCalls = events.filter(
      (event) => isToolCall(event) && event.data?.tool === 'edit',
    )
    expect(editCalls.length).toBeGreaterThanOrEqual(3) // fail + retry start + retry done
    const fatalErrors = events.filter(
      (event) =>
        isError(event) &&
        /do not guess|blind edit attempts/i.test(event.data.message),
    )
    expect(fatalErrors).toEqual([])
  })

  it('does not emit html_update when successful edits leave HTML unchanged', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')

    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async () =>
          fakeAgentStream(editToolStream({ callId: 'call-edit-unchanged' })),
      }),
    }))

    const { createProject } = (await getRuntimeFixture()).runtime.repository
    const project = await createProject()
    createdProjectIds.push(project.id)
    const response = new FakeResponse()

    await streamLandingAgent({
      projectId: project.id,
      prompt: 'Try an edit.',
      request: fakeRequest(),
      response: response as unknown as ServerResponse,
      textModel: 'z-ai/glm-5.2',
    })

    expect(htmlUpdateEvents(response.body)).toEqual([])
  })
})

describe('streamLandingAgent history', () => {
  it('sends only the current prompt and addresses the project memory thread', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')

    let capturedInput: unknown
    let capturedOptions: { memory?: { resource?: string; thread?: string } } =
      {}
    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async (
          messages: unknown,
          options: { memory?: { resource?: string; thread?: string } },
        ) => {
          capturedInput = messages
          capturedOptions = options
          return fakeAgentStream()
        },
      }),
    }))

    const { appendProjectMessageTurn, createProject } = (
      await getRuntimeFixture()
    ).runtime.repository
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
          action: 'Inspect /index.html',
          id: 'tool-history-1-read',
          result: 'Read 50 lines of 943',
          state: 'done',
          tool: 'read',
          type: 'tool_call',
        },
      ],
      prompt: 'Create a nice landing page for AI coding agent',
    })

    const response = new FakeResponse()

    await streamLandingAgent({
      projectId: project.id,
      prompt: 'what i asked you todo',
      request: fakeRequest(),
      response: response as unknown as ServerResponse,
      textModel: 'z-ai/glm-5.2',
    })

    // Observational Memory owns prior-turn history via the project thread —
    // only the new prompt is sent, never a replayed transcript.
    expect(capturedInput).toBe('what i asked you todo')
    expect(capturedOptions.memory).toEqual({
      resource: project.id,
      thread: project.id,
    })
  })
})

describe('streamLandingAgent screenshots', () => {
  it('captures screenshots through the Firecrawl Browser capture callback', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')

    let capturedSelector = ''
    let capturedResult: unknown
    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./lib/project-screenshot.ts', () => ({
      captureProjectSelectors: vi.fn<() => Promise<unknown[]>>(async () => [
        {
          captures: [
            {
              dataUrl: 'data:image/jpeg;base64,/9j/AAA=',
              elementMap: '',
              height: 422,
              imageUrl: '/api/projects/p/screenshots/001-mobile.jpg',
              mediaType: 'image/jpeg',
              viewport: 'mobile',
              width: 195,
            },
            {
              dataUrl: 'data:image/jpeg;base64,/9j/BBB=',
              elementMap: '',
              height: 512,
              imageUrl: '/api/projects/p/screenshots/002-tablet.jpg',
              mediaType: 'image/jpeg',
              viewport: 'tablet',
              width: 384,
            },
            {
              dataUrl: 'data:image/jpeg;base64,/9j/CCC=',
              elementMap: '',
              height: 450,
              imageUrl: '/api/projects/p/screenshots/003-desktop.jpg',
              mediaType: 'image/jpeg',
              viewport: 'desktop',
              width: 720,
            },
          ],
          selector: '#hero .cta',
        },
      ]),
    }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: (
        _store: unknown,
        _mastra: unknown,
        _memory: unknown,
        _baseUrl: string,
        _options: unknown,
        _textModel: string,
        captureProjectSelector: (selector: string) => Promise<unknown>,
      ) => ({
        stream: async () => {
          capturedSelector = '#hero .cta'
          capturedResult = await captureProjectSelector('#hero .cta')
          return fakeAgentStream()
        },
      }),
    }))

    const { createProject } = (await getRuntimeFixture()).runtime.repository
    const project = await createProject()
    createdProjectIds.push(project.id)
    const response = new FakeResponse()

    await streamLandingAgent({
      projectId: project.id,
      prompt: 'Check the page visually.',
      request: fakeRequest(),
      response: response as unknown as ServerResponse,
      textModel: 'z-ai/glm-5.2',
    })

    expect(capturedSelector).toBe('#hero .cta')
    expect(capturedResult).toMatchObject({
      captures: expect.arrayContaining([
        expect.objectContaining({
          imageUrl: expect.stringMatching(/\/api\/projects\/.*\/screenshots\//),
          viewport: 'mobile',
        }),
        expect.objectContaining({ viewport: 'tablet' }),
        expect.objectContaining({ viewport: 'desktop' }),
      ]),
      selector: '#hero .cta',
    })
    // No screenshot_request SSE event is emitted anymore.
    expect(parseSseEvents(response.body)).not.toContainEqual(
      expect.objectContaining({ event: 'screenshot_request' }),
    )
  })

  it('summarizes screenshot tool results without recounting vision cost', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')

    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async () => fakeAgentStream(screenshotToolStream()),
      }),
    }))

    const { createProject, getProject } = (await getRuntimeFixture()).runtime
      .repository
    const project = await createProject()
    createdProjectIds.push(project.id)
    const response = new FakeResponse()

    await streamLandingAgent({
      projectId: project.id,
      prompt: 'Review the rendered result.',
      request: fakeRequest(),
      response: response as unknown as ServerResponse,
      textModel: 'z-ai/glm-5.2',
    })

    const events = parseSseEvents(response.body)
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            images: expect.arrayContaining([
              expect.objectContaining({
                alt: expect.stringContaining('mobile'),
              }),
              expect.objectContaining({
                alt: expect.stringContaining('tablet'),
              }),
              expect.objectContaining({
                alt: expect.stringContaining('desktop'),
              }),
            ]),
            result: 'Captured mobile, tablet, desktop\nOCR 3 images',
            state: 'done',
            tool: 'screenshot',
          }),
          event: 'tool_call',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            cost: 0,
            costBreakdown: expect.objectContaining({
              vision: { calls: 0, cost: 0, images: 0 },
            }),
          }),
          event: 'stats',
        }),
      ]),
    )
    await expect(getProject(project.id)).resolves.toMatchObject({
      messages: [
        expect.objectContaining({
          parts: expect.arrayContaining([
            expect.objectContaining({
              images: expect.arrayContaining([
                expect.objectContaining({
                  url: expect.stringMatching(
                    /\/api\/projects\/project-test\/screenshots\//,
                  ),
                }),
              ]),
              tool: 'screenshot',
            }),
          ]),
        }),
      ],
    })
  })

  it('marks failed screenshot result payloads as tool errors', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')

    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async () =>
          fakeAgentStream(screenshotToolStream({ failed: true })),
      }),
    }))

    const { createProject } = (await getRuntimeFixture()).runtime.repository
    const project = await createProject()
    createdProjectIds.push(project.id)
    const response = new FakeResponse()

    await streamLandingAgent({
      projectId: project.id,
      prompt: 'Review the rendered result.',
      request: fakeRequest(),
      response: response as unknown as ServerResponse,
      textModel: 'z-ai/glm-5.2',
    })

    const events = parseSseEvents(response.body)
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            result:
              'Selected element screenshot is too large (1456×6691). Choose a smaller selector.',
            state: 'error',
            tool: 'screenshot',
          }),
          event: 'tool_call',
        }),
      ]),
    )
  })
})

describe('streamLandingAgent message persistence', () => {
  it('persists a streaming turn before the agent stream starts', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')

    let capturedProjectId = ''
    let midRunMessages: Array<{
      isStreaming?: boolean
      prompt?: string
    }> = []
    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async () => {
          const { getProject } = (await getRuntimeFixture()).runtime.repository
          const project = await getProject(capturedProjectId)
          midRunMessages = (project?.messages ?? []).map((turn) => ({
            isStreaming: turn.isStreaming,
            prompt: turn.prompt,
          }))
          return fakeAgentStream()
        },
      }),
    }))

    const { createProject } = (await getRuntimeFixture()).runtime.repository
    const project = await createProject()
    createdProjectIds.push(project.id)
    capturedProjectId = project.id
    const response = new FakeResponse()

    await streamLandingAgent({
      projectId: project.id,
      prompt: 'Build something.',
      request: fakeRequest(),
      response: response as unknown as ServerResponse,
      textModel: 'z-ai/glm-5.2',
    })

    expect(midRunMessages).toEqual([
      { isStreaming: true, prompt: 'Build something.' },
    ])

    const { getProject } = (await getRuntimeFixture()).runtime.repository
    const saved = await getProject(project.id)
    // The finalized turn replaces the streaming checkpoint (upsert by id), so
    // the project ends with exactly one turn, no longer streaming.
    expect(saved?.messages).toHaveLength(1)
    expect(saved?.messages[0]).toMatchObject({
      isStreaming: false,
      prompt: 'Build something.',
    })
  })
})

describe('streamLandingAgent screenshot capture errors', () => {
  it('propagates a Firecrawl Browser capture failure to the tool result', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')

    const captureError = 'Firecrawl Browser is rate limited. Try again shortly.'
    let propagatedError = ''
    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./lib/project-screenshot.ts', () => ({
      captureProjectSelectors: vi.fn<() => Promise<never>>(async () => {
        throw new Error(captureError)
      }),
    }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: (
        _store: unknown,
        _mastra: unknown,
        _memory: unknown,
        _baseUrl: string,
        _options: unknown,
        _textModel: string,
        captureProjectSelector: (selector: string) => Promise<unknown>,
      ) => ({
        stream: async () => {
          try {
            await captureProjectSelector('#hero')
          } catch (error) {
            propagatedError =
              error instanceof Error ? error.message : String(error)
          }
          return fakeAgentStream()
        },
      }),
    }))

    const { createProject } = (await getRuntimeFixture()).runtime.repository
    const project = await createProject()
    createdProjectIds.push(project.id)
    const response = new FakeResponse()

    await streamLandingAgent({
      projectId: project.id,
      prompt: 'Review the rendered result.',
      request: fakeRequest(),
      response: response as unknown as ServerResponse,
      textModel: 'z-ai/glm-5.2',
    })

    // The capture error propagated to the tool caller.
    expect(propagatedError).toBe(captureError)
    // The run completes normally — the capture error is caught by the tool.
    expect(response.body).toContain('event: done')
  })
})

describe('streamLandingAgent raw mastra message persistence', () => {
  const ASSISTANT_RAW = {
    content: {
      format: 2,
      parts: [
        { text: 'I edited the hero.', type: 'text' },
        {
          toolInvocation: {
            args: {
              edits: [
                {
                  action: 'Rewrite hero',
                  code: '<h1>New</h1>',
                  from: 'a2',
                },
              ],
            },
            state: 'result',
            toolCallId: 'call-edit-raw-1',
            toolName: 'edit',
          },
          type: 'tool-invocation',
        },
      ],
    },
    id: 'mastra-assistant-1',
    role: 'assistant',
  }
  const TOOL_RAW = {
    content: { format: 2, parts: [{ type: 'tool-result' }] },
    id: 'mastra-tool-1',
    role: 'assistant',
  }

  it('captures response messages after the run; later turns send only the new prompt', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')

    let capturedReplay: unknown
    let capturedOptions: { memory?: { resource?: string; thread?: string } } =
      {}
    let runCount = 0
    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async (
          messages: unknown,
          options: { memory?: { resource?: string; thread?: string } },
        ) => {
          runCount += 1
          capturedReplay = messages
          capturedOptions = options
          return fakeAgentStream(undefined, undefined, {
            messageList: {
              get: {
                response: {
                  db: () => (runCount === 1 ? [ASSISTANT_RAW, TOOL_RAW] : []),
                },
              },
            },
          })
        },
      }),
    }))

    const { createProject } = (await getRuntimeFixture()).runtime.repository
    const project = await createProject()
    createdProjectIds.push(project.id)

    // First turn: produces the page; raw response messages are captured.
    await streamLandingAgent({
      projectId: project.id,
      prompt: 'Build the page.',
      request: fakeRequest(),
      response: new FakeResponse() as unknown as ServerResponse,
      textModel: 'z-ai/glm-5.2',
    })

    const { readAgentMessages } = (await getRuntimeFixture()).runtime.repository
    const agentEntries = await readAgentMessages(project.id)
    expect(agentEntries.at(-1)).toMatchObject({
      messages: [ASSISTANT_RAW, TOOL_RAW],
      turnId: expect.stringMatching(/^turn-/),
    })

    // Second turn: raw messages stay persisted for inspection, but history
    // replay is owned by the Observational Memory thread — the agent receives
    // only the new prompt, addressed to the same project thread.
    await streamLandingAgent({
      projectId: project.id,
      prompt: 'Tighten the hero.',
      request: fakeRequest(),
      response: new FakeResponse() as unknown as ServerResponse,
      textModel: 'z-ai/glm-5.2',
    })

    expect(capturedReplay).toBe('Tighten the hero.')
    expect(capturedOptions.memory).toEqual({
      resource: project.id,
      thread: project.id,
    })
  })

  it('strips reasoning parts before persisting raw messages for replay', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')

    const WITH_REASONING = {
      content: {
        format: 2,
        parts: [
          { text: 'long private chain-of-thought', type: 'reasoning' },
          { text: 'I edited the hero.', type: 'text' },
          {
            toolInvocation: {
              args: {
                edits: [
                  {
                    action: 'Rewrite hero',
                    code: '<h1>New</h1>',
                    from: 'a2',
                  },
                ],
              },
              state: 'result',
              toolCallId: 'call-edit-rr',
              toolName: 'edit',
            },
            type: 'tool-invocation',
          },
        ],
      },
      id: 'mastra-reasoning-1',
      role: 'assistant',
    }
    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async () =>
          fakeAgentStream(undefined, undefined, {
            messageList: {
              get: { response: { db: () => [WITH_REASONING] } },
            },
          }),
      }),
    }))

    const { createProject, readAgentMessages } = (await getRuntimeFixture())
      .runtime.repository
    const project = await createProject()
    createdProjectIds.push(project.id)

    await streamLandingAgent({
      projectId: project.id,
      prompt: 'Build it.',
      request: fakeRequest(),
      response: new FakeResponse() as unknown as ServerResponse,
      textModel: 'z-ai/glm-5.2',
    })

    const persisted = await readAgentMessages(project.id)
    const firstMsg = persisted.at(-1)?.messages[0] as
      | undefined
      | { content?: { parts?: { type: string }[] } }
    const parts = firstMsg?.content?.parts ?? []
    const types = parts.map((part) => part.type)
    // Reasoning is stripped; the decision-relevant content survives.
    expect(types).not.toContain('reasoning')
    expect(types).toEqual(['text', 'tool-invocation'])
  })
})

describe('streamLandingAgent stream errors + cleanup', () => {
  it('surfaces a mid-stream error as an SSE error event and still emits done', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    async function* throwingStream() {
      yield { payload: { text: 'partial' }, type: 'text-delta' }
      throw new Error('upstream exploded')
    }
    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async () => fakeAgentStream(throwingStream()),
      }),
    }))
    const { createProject } = (await getRuntimeFixture()).runtime.repository
    const project = await createProject()
    createdProjectIds.push(project.id)
    const request = fakeRequest()
    const response = new FakeResponse()
    await streamLandingAgent({
      projectId: project.id,
      prompt: 'Boom.',
      request,
      response: response as unknown as ServerResponse,
      textModel: 'z-ai/glm-5.2',
    })
    const events = parseSseEvents(response.body)
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: 'stats' }),
        expect.objectContaining({
          data: { message: 'upstream exploded' },
          event: 'error',
        }),
      ]),
    )
    expect(events.at(-1)).toEqual({ data: {}, event: 'done' })
    expect(request.listenerCount('close')).toBe(0)
  })

  it('continues the run after the client disconnects mid-run', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    let resolveHang!: () => void
    const hang = new Promise<void>((resolve) => {
      resolveHang = resolve
    })
    async function* hangingStream() {
      yield { payload: { text: 'working' }, type: 'text-delta' }
      await hang
      yield { payload: { text: ' done' }, type: 'text-delta' }
    }
    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async () =>
          fakeAgentStream(hangingStream(), undefined, {
            finishReason: Promise.resolve('stop'),
          }),
      }),
    }))
    const { createProject, readClientMessages } = (await getRuntimeFixture())
      .runtime.repository
    const project = await createProject()
    createdProjectIds.push(project.id)
    const request = fakeRequest()
    const response = new FakeResponse()
    const run = streamLandingAgent({
      projectId: project.id,
      prompt: 'Hang.',
      request,
      response: response as unknown as ServerResponse,
      textModel: 'z-ai/glm-5.2',
    })
    // Wait for the stream to start (mid-run), then simulate client disconnect.
    await new Promise((r) => setImmediate(r))
    request.emit('close')
    resolveHang() // unblock the stream — it should still complete normally.
    await run
    // The run completed normally (not stopped) — terminal stats are persisted.
    const messages = await readClientMessages(project.id)
    expect(messages).toContainEqual(
      expect.objectContaining({ event: 'run_terminal' }),
    )
    // Disconnect did NOT produce a 'stopped' finishReason.
    expect(messages).not.toContainEqual(
      expect.objectContaining({
        event: 'error',
        payload: { message: 'stopped' },
      }),
    )
  })

  it('flushes final cost/stats on a graceful stop (stopLandingAgent)', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    let resolveHang!: () => void
    const hang = new Promise<void>((resolve) => {
      resolveHang = resolve
    })
    async function* hangingStream() {
      yield { payload: { text: 'working' }, type: 'text-delta' }
      await hang
      // Mastra may end the iterator cleanly after abort rather than throwing.
      // The run must still be classified as stopped (not empty-draft error).
    }
    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async () =>
          fakeAgentStream(hangingStream(), undefined, {
            finishReason: Promise.resolve('tripwire'),
          }),
      }),
    }))
    const { createProject, readClientMessages } = (await getRuntimeFixture())
      .runtime.repository
    const project = await createProject()
    createdProjectIds.push(project.id)
    const stopLandingAgent = (await getTestRunner()).stop
    const request = fakeRequest()
    const response = new FakeResponse()
    const run = streamLandingAgent({
      projectId: project.id,
      prompt: 'Hang.',
      request,
      response: response as unknown as ServerResponse,
      textModel: 'z-ai/glm-5.2',
    })
    // Wait for the run to start emitting events (mid-run registration)
    const registered = Date.now() + 2000
    while (Date.now() < registered) {
      const messages = await readClientMessages(project.id)
      if (messages.some((m) => m.dir === 'out')) break
      await new Promise((r) => setImmediate(r))
    }
    // Graceful stop: aborts the run's Mastra stream but leaves the SSE response
    // open so terminal cost/stats + done are delivered to the client.
    const stopping = stopLandingAgent(project.id)
    resolveHang() // unblock the stream → it ends cleanly with signal.aborted
    await expect(stopping).resolves.toMatchObject({ stopped: true })
    await run
    const events = parseSseEvents(response.body)
    // Cost/stats are flushed even though the run was stopped mid-stream, so the
    // client can render Spend / tokens for a stopped run.
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({ finishReason: 'stopped' }),
          event: 'stats',
        }),
        expect.objectContaining({
          data: { message: 'stopped' },
          event: 'error',
        }),
      ]),
    )
    expect(events).not.toContainEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          message: expect.stringContaining('without generating project HTML'),
        }),
        event: 'error',
      }),
    )
    // stats precedes the terminal error, which precedes done.
    const statsIndex = events.findIndex((e) => e.event === 'stats')
    const errorIndex = events.findIndex((e) => e.event === 'error')
    const doneIndex = events.findIndex((e) => e.event === 'done')
    expect(statsIndex).toBeLessThan(errorIndex)
    expect(errorIndex).toBeLessThan(doneIndex)
    expect(events.at(-1)).toEqual({ data: {}, event: 'done' })
    expect(request.listenerCount('close')).toBe(0)
  })

  it('rejects a concurrent active run without replacing the first owner', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    let resolveHang!: () => void
    const hang = new Promise<void>((resolve) => {
      resolveHang = resolve
    })
    async function* hangingStream() {
      yield { payload: { text: 'working' }, type: 'text-delta' }
      await hang
    }
    const stream = vi.fn<() => Promise<ReturnType<typeof fakeAgentStream>>>(
      async () => fakeAgentStream(hangingStream()),
    )
    const createLandingPageAgent = vi.fn<() => { stream: typeof stream }>(
      () => ({
        stream,
      }),
    )
    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent,
    }))

    const { createProject, getProject, readClientMessages } = (
      await getRuntimeFixture()
    ).runtime.repository
    const project = await createProject()
    createdProjectIds.push(project.id)
    const stopLandingAgent = (await getTestRunner()).stop
    const firstRequest = fakeRequest()
    const firstResponse = new FakeResponse()
    const firstRun = streamLandingAgent({
      projectId: project.id,
      prompt: 'First run.',
      request: firstRequest,
      response: firstResponse as unknown as ServerResponse,
      textModel: 'z-ai/glm-5.2',
    })
    await vi.waitFor(() => expect(stream).toHaveBeenCalledOnce())

    const secondResponse = new FakeResponse()
    await streamLandingAgent({
      projectId: project.id,
      prompt: 'Second run.',
      request: fakeRequest(),
      response: secondResponse as unknown as ServerResponse,
      textModel: 'openai/gpt-5.4',
    })

    expect(parseSseEvents(secondResponse.body)).toEqual([
      {
        data: { message: 'A run is already active for this project.' },
        event: 'error',
      },
      { data: {}, event: 'done' },
    ])
    expect(createLandingPageAgent).toHaveBeenCalledOnce()
    expect(stream).toHaveBeenCalledOnce()
    expect(
      (await readClientMessages(project.id)).filter(
        (entry) => entry.dir === 'in' && entry.type === 'prompt',
      ),
    ).toHaveLength(1)
    await expect(getProject(project.id)).resolves.toMatchObject({
      model: 'z-ai/glm-5.2',
    })

    const stopping = stopLandingAgent(project.id)
    resolveHang()
    await expect(stopping).resolves.toMatchObject({ stopped: true })
    await firstRun
    await expect(stopLandingAgent(project.id)).resolves.toMatchObject({
      stopped: false,
    })
    expect(firstRequest.listenerCount('close')).toBe(0)
  })

  it('persists terminal events and cleans up when socket writes throw', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async () => fakeAgentStream(),
      }),
    }))

    const { createProject, readClientMessages } = (await getRuntimeFixture())
      .runtime.repository
    const project = await createProject()
    createdProjectIds.push(project.id)
    const stopLandingAgent = (await getTestRunner()).stop
    const request = fakeRequest()
    const response = new FakeResponse({ throwOnWrite: true })

    await streamLandingAgent({
      projectId: project.id,
      prompt: 'Persist despite a closed socket.',
      request,
      response: response as unknown as ServerResponse,
      textModel: 'z-ai/glm-5.2',
    })

    const eventNames = (await readClientMessages(project.id))
      .filter((entry) => entry.dir === 'out')
      .map((entry) => entry.event)
    expect(eventNames.at(-1)).toBe('run_terminal')
    expect(request.listenerCount('close')).toBe(0)
    await expect(stopLandingAgent(project.id)).resolves.toMatchObject({
      stopped: false,
    })
    expect(response.writableEnded).toBe(true)
  })

  it('emits the no-generated-html error when a run finishes without writing HTML', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    async function* textOnlyStream() {
      yield {
        payload: { text: 'I will not edit anything.' },
        type: 'text-delta',
      }
    }
    vi.doMock('./index.ts', () => ({ mastra: {} }))
    vi.doMock('./agents/landing-page-agent.ts', () => ({
      createLandingPageAgent: () => ({
        stream: async () => fakeAgentStream(textOnlyStream()),
      }),
    }))
    const { createProject } = (await getRuntimeFixture()).runtime.repository
    const project = await createProject()
    createdProjectIds.push(project.id)
    const response = new FakeResponse()
    await streamLandingAgent({
      projectId: project.id,
      prompt: 'Do nothing.',
      request: fakeRequest(),
      response: response as unknown as ServerResponse,
      textModel: 'z-ai/glm-5.2',
    })
    const events = parseSseEvents(response.body)
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: {
            message:
              'Agent finished without generating project HTML. The draft still has no content because no successful edit changed the page.',
          },
          event: 'error',
        }),
      ]),
    )
  })
})

class FakeResponse {
  readonly chunks: string[] = []
  destroyed = false
  headersSent = false
  readonly options: { throwOnWrite?: boolean }
  statusCode = 200
  writableEnded = false

  get body() {
    return this.chunks.join('')
  }

  constructor(options: { throwOnWrite?: boolean } = {}) {
    this.options = options
  }

  end(chunk?: unknown) {
    if (chunk !== undefined) this.write(chunk)
    this.writableEnded = true
    return this
  }

  setHeader(_name: string, _value: unknown) {
    return this
  }

  write(chunk: unknown) {
    if (this.options.throwOnWrite) throw new Error('socket write failed')
    this.chunks.push(String(chunk))
    return true
  }

  writeHead(statusCode: number, _headers?: OutgoingHttpHeaders) {
    this.headersSent = true
    this.statusCode = statusCode
    return this
  }
}

function deferred<T>() {
  let reject!: (error: unknown) => void
  let resolve!: (value: PromiseLike<T> | T) => void
  const promise = new Promise<T>((accept, deny) => {
    resolve = accept
    reject = deny
  })
  return { promise, reject, resolve }
}

async function* editToolStream({
  callId = 'call-edit-1',
  hasResultOverride = false,
  isError = false,
  mutate,
  result,
}: {
  callId?: string
  hasResultOverride?: boolean
  isError?: boolean
  mutate?: () => void
  result?: unknown
}) {
  yield {
    payload: {
      args: {
        edits: [
          {
            action: 'Update hero copy',
            code: '<h1>Hi</h1>',
            from: 'a2',
          },
        ],
      },
      toolCallId: callId,
      toolName: 'edit',
    },
    type: 'tool-call',
  }
  mutate?.()
  yield {
    payload: {
      args: {
        edits: [
          {
            action: 'Update hero copy',
            code: '<h1>Hi</h1>',
            from: 'a2',
          },
        ],
      },
      isError,
      result: hasResultOverride
        ? result
        : isError
          ? { reason: 'oldText did not match' }
          : { changedLines: 2, ok: true },
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
  extras: Record<string, unknown> = {},
) {
  return {
    finishReason: Promise.resolve('stop'),
    fullStream,
    usage: Promise.resolve(usage),
    ...extras,
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

async function* liveUsageStepFinishStream() {
  yield {
    payload: {
      output: {
        usage: {
          cachedInputTokens: 3,
          inputTokens: 23,
          outputTokens: 8,
          totalTokens: 31,
        },
      },
      stepResult: { reason: 'tool-calls' },
    },
    type: 'step-finish',
  }
}

async function* mixedToolStream() {
  yield { payload: { text: 'Thinking.' }, type: 'reasoning-delta' }
  yield { payload: { text: 'Done.' }, type: 'text-delta' }
  yield {
    payload: {
      args: {
        action: 'Create product image',
        aspectRatio: '1:1',
        prompt: 'Studio product shot',
      },
      toolCallId: 'call-image',
      toolName: 'generate_image',
    },
    type: 'tool-call',
  }
  yield {
    payload: {
      args: { action: 'Create product image' },
      isError: false,
      result: {
        cost: 0.02,
        imagesGenerated: 2,
        ok: true,
        url: 'http://localhost:3001/images/img-1.jpg',
      },
      toolCallId: 'call-image',
      toolName: 'generate_image',
    },
    type: 'tool-result',
  }
  yield {
    payload: {
      args: { action: 'Scrape brand', url: 'https://example.test' },
      toolCallId: 'call-scrape',
      toolName: 'scrape',
    },
    type: 'tool-call',
  }
  yield {
    payload: {
      args: { action: 'Scrape brand', url: 'https://example.test' },
      isError: false,
      result: {
        charCount: 123,
        creditsUsed: 1,
        imageCount: 3,
        imageOcr: {
          cost: 0.004,
          imagesAnalyzed: 2,
          ok: true,
          usage: { completionTokens: 20, promptTokens: 100 },
        },
        linkCount: 2,
        title: 'Example',
        url: 'https://example.test',
      },
      toolCallId: 'call-scrape',
      toolName: 'scrape',
    },
    type: 'tool-result',
  }
  yield {
    payload: {
      args: { action: 'Find CTA', text: 'CTA' },
      toolCallId: 'call-find',
      toolName: 'find',
    },
    type: 'tool-call-input-streaming-start',
  }
  yield {
    payload: {
      args: { action: 'Find CTA', text: 'CTA' },
      isError: false,
      result: { matchCount: 2, truncatedLines: true },
      toolCallId: 'call-find',
      toolName: 'find',
    },
    type: 'tool-result',
  }
  yield {
    payload: {
      args: { action: 'Inspect current project HTML' },
      isError: false,
      result: {
        endLine: 34,
        ok: true,
        startLine: 10,
        tag: 'ABCD',
        text: '[index.html#ABCD]',
        totalLines: 100,
        truncated: true,
      },
      toolCallId: 'call-read',
      toolName: 'read',
    },
    type: 'tool-result',
  }
  yield {
    payload: {
      args: { path: 'reference.md', skillName: 'design' },
      error: 'Boom',
      toolCallId: 'call-skill-read',
      toolName: 'skill_read',
    },
    type: 'tool-error',
  }
}

async function* multiStepRawCostStream() {
  yield {
    payload: {
      id: 'chatcmpl-step-1',
      object: 'chat.completion.chunk',
      usage: { cost: 0.004 },
    },
    type: 'raw',
  }
  yield {
    payload: {
      id: 'chatcmpl-step-2',
      object: 'chat.completion.chunk',
      usage: { cost: 0.012 },
    },
    type: 'raw',
  }
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

async function* screenshotToolStream({ failed = false } = {}) {
  const args = failed ? { selector: 'body' } : { selector: '#hero' }
  yield {
    payload: {
      args,
      toolCallId: failed ? 'call-screenshot-failed' : 'call-screenshot-1',
      toolName: 'screenshot',
    },
    type: 'tool-call',
  }
  yield {
    payload: {
      args,
      isError: false,
      result: failed
        ? {
            captures: [],
            imageOcr: {
              imagesAnalyzed: 0,
              ok: false,
              reason:
                'Selected element screenshot is too large (1456×6691). Choose a smaller selector.',
              text: '',
              usage: null,
            },
            ok: false,
            reason:
              'Selected element screenshot is too large (1456×6691). Choose a smaller selector.',
            selector: 'body',
            text: '',
          }
        : {
            captures: [
              {
                elementMap: '',
                height: 422,
                imageUrl:
                  '/api/projects/project-test/screenshots/001-mobile.jpg',
                mediaType: 'image/jpeg',
                viewport: 'mobile',
                width: 195,
              },
              {
                elementMap: '',
                height: 512,
                imageUrl:
                  '/api/projects/project-test/screenshots/002-tablet.jpg',
                mediaType: 'image/jpeg',
                viewport: 'tablet',
                width: 384,
              },
              {
                elementMap: '',
                height: 450,
                imageUrl:
                  '/api/projects/project-test/screenshots/003-desktop.jpg',
                mediaType: 'image/jpeg',
                viewport: 'desktop',
                width: 720,
              },
            ],
            imageOcr: {
              cost: 0.006,
              imagesAnalyzed: 3,
              ok: true,
              text: 'Image 1\nHero headline visible. CTA is clipped.',
              usage: {
                completionTokens: 20,
                promptTokens: 30,
                totalTokens: 50,
              },
            },
            ok: true,
            selector: '#hero',
            text: 'Image 1\nHero headline visible. CTA is clipped.',
          },
      toolCallId: failed ? 'call-screenshot-failed' : 'call-screenshot-1',
      toolName: 'screenshot',
    },
    type: 'tool-result',
  }
}
