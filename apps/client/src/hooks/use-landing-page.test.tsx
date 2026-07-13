// @vitest-environment happy-dom

import type { LandingTurn } from '@workspace/prompt-panel'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Project, ProjectMeta } from '../lib/projects-api'
import type { StreamSSEOptions } from '../lib/sse-client'
import { useLandingPage, type UseLandingPage } from './use-landing-page'

const mocks = vi.hoisted(() => ({
  getProject: vi.fn<(id: string) => Promise<Project>>(),
  stopProjectAgent: vi.fn<(id: string) => Promise<boolean>>(),
  streamSSE:
    vi.fn<
      (url: string, body: unknown, options: StreamSSEOptions) => Promise<void>
    >(),
  updateProjectModels: vi.fn<() => Promise<ProjectMeta>>(),
}))

vi.mock('../lib/projects-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/projects-api')>()),
  getProject: mocks.getProject,
  stopProjectAgent: mocks.stopProjectAgent,
  updateProjectModels: mocks.updateProjectModels,
}))

vi.mock('../lib/sse-client', () => ({ streamSSE: mocks.streamSSE }))

const priorTurn = turn({ id: 'turn-prior', prompt: 'Earlier' })

let container: HTMLDivElement
let current: UseLandingPage
let root: Root

beforeEach(() => {
  ;(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  vi.resetAllMocks()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.useRealTimers()
})

describe('useLandingPage transport reconciliation', () => {
  it('reconciles a persisted terminal turn after a transport rejection', async () => {
    await mount(project({ messages: [priorTurn] }))
    mocks.streamSSE.mockImplementation(async (_url, body) => {
      const turnId = requestTurnId(body)
      mocks.getProject.mockResolvedValueOnce(
        project({
          indexHtml: '<main>Recovered</main>',
          messages: [priorTurn, terminalTurn(turnId)],
        }),
      )
      throw new Error('network lost')
    })

    await act(async () => {
      current.send({ prompt: 'Build it' })
      await flushAsyncWork()
    })

    expect(current.isStreaming).toBe(false)
    expect(current.turns.map(({ id }) => id)).toEqual([
      'turn-prior',
      expect.stringMatching(/^turn-/),
    ])
    expect(current.turns[1]).toMatchObject({
      isStreaming: false,
      parts: [expect.objectContaining({ type: 'stats' })],
    })
    expect(current.turns[1]?.error).toBeUndefined()
    expect(current.html).toBe('<main>Recovered</main>')
    expect(mocks.getProject).toHaveBeenCalledTimes(2)
  })

  it('treats EOF without custom done as transport loss and reconciles', async () => {
    await mount(project())
    mocks.streamSSE.mockImplementation(async (_url, body) => {
      const turnId = requestTurnId(body)
      mocks.getProject.mockResolvedValueOnce(
        project({ messages: [terminalTurn(turnId)] }),
      )
    })

    await act(async () => {
      current.send({ prompt: 'Build it' })
      await flushAsyncWork()
    })

    expect(current.turns[0]).toMatchObject({
      isStreaming: false,
      parts: [expect.objectContaining({ type: 'stats' })],
    })
    expect(current.turns[0]?.error).toBeUndefined()
    expect(mocks.getProject).toHaveBeenCalledTimes(2)
  })

  it('records a transport error when EOF reconciliation is exhausted', async () => {
    await mount(project())
    vi.useFakeTimers()
    mocks.getProject.mockResolvedValue(project())
    mocks.streamSSE.mockResolvedValue()

    act(() => current.send({ prompt: 'Build it' }))
    await act(async () => {
      await vi.runAllTimersAsync()
      await flushAsyncWork()
    })

    expect(current.isStreaming).toBe(false)
    expect(current.turns[0]).toMatchObject({
      error: 'Agent stream ended before terminal done event.',
      isStreaming: false,
    })
    expect(mocks.getProject).toHaveBeenCalledTimes(5)
  })
})

describe('useLandingPage run lifecycle', () => {
  it('gracefully drains a stopped run, preserves stats, clears the safety timeout, and blocks another send', async () => {
    await mount(project())
    vi.useFakeTimers()
    mocks.stopProjectAgent.mockResolvedValue(true)
    let resolveStream!: () => void
    let streamOptions!: StreamSSEOptions
    mocks.streamSSE.mockImplementation(
      async (_url, _body, options) =>
        new Promise<void>((resolve) => {
          resolveStream = resolve
          streamOptions = options
        }),
    )

    act(() => current.send({ prompt: 'Build it' }))
    const requestBody = mocks.streamSSE.mock.calls[0]?.[1]
    const turnId = requestTurnId(requestBody)
    expect(turnId).toBe(current.turns[0]?.id)

    act(() => current.stop())
    expect(mocks.stopProjectAgent).toHaveBeenCalledOnce()
    expect(streamOptions.signal.aborted).toBe(false)
    expect(current.isStreaming).toBe(true)
    expect(current.turns[0]).toMatchObject({
      isStreaming: false,
      stopped: true,
    })

    act(() => current.send({ prompt: 'Must stay blocked' }))
    expect(mocks.streamSSE).toHaveBeenCalledOnce()
    expect(current.turns).toHaveLength(1)

    act(() => {
      streamOptions.onEvent({
        data: {
          cost: 0.01,
          durationMs: 250,
          finishReason: 'stopped',
          model: 'z-ai/glm-5.2',
          usage: { totalTokens: 10 },
        },
        event: 'stats',
      })
      streamOptions.onEvent({ data: { message: 'stopped' }, event: 'error' })
      streamOptions.onEvent({ data: {}, event: 'done' })
    })
    await act(async () => {
      resolveStream()
      await flushAsyncWork()
    })

    expect(current.isStreaming).toBe(false)
    expect(current.turns[0]).toMatchObject({
      isStreaming: false,
      parts: [expect.objectContaining({ type: 'stats' })],
      stopped: true,
    })
    expect(current.turns[0]?.error).toBeUndefined()
    await vi.advanceTimersByTimeAsync(8001)
    expect(streamOptions.signal.aborted).toBe(false)
  })

  it('blocks duplicate sends before streaming state rerenders', async () => {
    await mount(project())
    let resolveStream!: () => void
    let streamOptions!: StreamSSEOptions
    mocks.streamSSE.mockImplementation(
      async (_url, _body, options) =>
        new Promise<void>((resolve) => {
          resolveStream = resolve
          streamOptions = options
        }),
    )

    act(() => {
      current.send({ prompt: 'First' })
      current.send({ prompt: 'Duplicate' })
    })

    expect(mocks.streamSSE).toHaveBeenCalledOnce()
    expect(current.turns).toHaveLength(1)
    act(() => streamOptions.onEvent({ data: {}, event: 'done' }))
    await act(async () => {
      resolveStream()
      await flushAsyncWork()
    })
  })

  it('adds attached image previews to analyze-image tool args', async () => {
    await mount(project())
    mocks.streamSSE.mockImplementation(async (_url, _body, options) => {
      options.onEvent({
        data: {
          action: 'Analyze attached visual reference',
          detail: 'Analyze attached visual reference\nwireframe.png',
          id: 'tool-1-analyze_image',
          state: 'running',
          tool: 'analyze_image',
        },
        event: 'tool_call',
      })
      options.onEvent({ data: {}, event: 'done' })
    })

    await act(async () => {
      current.send({
        attachments: [
          {
            dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
            id: 'image-1',
            mediaType: 'image/png',
            name: 'wireframe.png',
            size: 8,
          },
        ],
        prompt: 'Use this reference',
      })
      await flushAsyncWork()
    })

    expect(current.turns[0]?.parts[0]).toMatchObject({
      images: [
        {
          alt: 'wireframe.png',
          url: 'data:image/png;base64,iVBORw0KGgo=',
        },
      ],
      tool: 'analyze_image',
      type: 'tool_call',
    })
  })
})

async function flushAsyncWork(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve()
}

function Harness({
  onError,
  projectId,
}: {
  onError: (message: string) => void
  projectId: string
}) {
  current = useLandingPage({ onError, projectId })
  return null
}

async function mount(initialProject: Project): Promise<void> {
  mocks.getProject.mockResolvedValueOnce(initialProject)

  await act(async () => {
    root.render(
      <Harness onError={vi.fn<(message: string) => void>()} projectId="p1" />,
    )
    await flushAsyncWork()
  })
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    hasHtml: true,
    id: 'p1',
    indexHtml: '<main>Initial</main>',
    messages: [],
    model: 'z-ai/glm-5.2',
    title: 'Project',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function requestTurnId(body: unknown): string {
  if (!body || typeof body !== 'object' || !('turnId' in body)) {
    throw new Error('Expected request turnId')
  }
  const turnId = body.turnId
  if (typeof turnId !== 'string') throw new Error('Expected string turnId')
  return turnId
}

function terminalTurn(id: string): LandingTurn {
  return turn({
    id,
    parts: [
      {
        cost: 0.01,
        durationMs: 250,
        finishReason: 'stop',
        model: 'z-ai/glm-5.2',
        type: 'stats',
        usage: { totalTokens: 10 },
      },
    ],
  })
}

function turn(overrides: Partial<LandingTurn> = {}): LandingTurn {
  return {
    htmlSwaps: 0,
    id: 'turn-1',
    isStreaming: false,
    model: 'z-ai/glm-5.2',
    parts: [],
    prompt: 'Prompt',
    ...overrides,
  }
}
