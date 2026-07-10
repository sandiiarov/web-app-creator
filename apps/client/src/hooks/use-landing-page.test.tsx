// @vitest-environment happy-dom

import type { LandingTurn } from '@workspace/prompt-panel'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Project, ProjectMeta } from '../lib/projects-api'
import type { StreamSSEOptions } from '../lib/sse-client'
import { useLandingPage, type UseLandingPage } from './use-landing-page'

const mocks = vi.hoisted(() => ({
  captureProjectScreenshot: vi.fn<() => Promise<never>>(),
  getProject: vi.fn<(id: string) => Promise<Project>>(),
  postScreenshotResponse: vi.fn<() => Promise<void>>(),
  stopProjectAgent: vi.fn<(id: string) => Promise<boolean>>(),
  streamSSE:
    vi.fn<
      (url: string, body: unknown, options: StreamSSEOptions) => Promise<void>
    >(),
  updateProjectModels: vi.fn<() => Promise<ProjectMeta>>(),
}))

vi.mock('@workspace/landing-preview', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@workspace/landing-preview')>()),
  captureProjectScreenshot: mocks.captureProjectScreenshot,
}))

vi.mock('../lib/projects-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/projects-api')>()),
  getProject: mocks.getProject,
  postScreenshotResponse: mocks.postScreenshotResponse,
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
