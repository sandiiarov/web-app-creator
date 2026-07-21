// @vitest-environment happy-dom

import type { LandingTurn } from '@workspace/prompt-panel'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  AgentEventSubscription,
  ProjectMeta,
  SendPromptResult,
} from '../lib/projects-api'
import type { SSEEvent, StreamSSEOptions } from '../lib/sse-client'
import { useLandingPage, type UseLandingPage } from './use-landing-page'

const mocks = vi.hoisted(() => ({
  sendPrompt: vi
    .fn<(input: unknown) => Promise<SendPromptResult>>()
    .mockResolvedValue({
      status: 'running',
      turnId: 'replaced-in-tests',
    }),
  stopProjectAgent: vi.fn<(id: string) => Promise<boolean>>(),
  streamSSEGet:
    vi.fn<(url: string, options: StreamSSEOptions) => Promise<void>>(),
  updateProjectModels: vi.fn<() => Promise<ProjectMeta>>(),
}))

vi.mock('../lib/projects-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/projects-api')>()),
  sendPrompt: mocks.sendPrompt,
  stopProjectAgent: mocks.stopProjectAgent,
  updateProjectModels: mocks.updateProjectModels,
}))

vi.mock('../lib/sse-client', () => ({ streamSSEGet: mocks.streamSSEGet }))

const priorTurn = turn({ id: 'turn-prior', prompt: 'Earlier' })

let container: HTMLDivElement
let current: UseLandingPage
let root: Root
let subscribeOnEvent: (event: SSEEvent) => void

beforeEach(() => {
  ;(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  vi.resetAllMocks()
  mocks.sendPrompt.mockResolvedValue({ status: 'running', turnId: 'replaced' })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  mocks.streamSSEGet.mockImplementation(async (_url, options) => {
    // Subscribe stream stays open for the test; events arrive via `onEvent`.
    subscribeOnEvent = options.onEvent
    return new Promise<void>(() => {})
  })
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.useRealTimers()
})

describe('useLandingPage subscribe mount', () => {
  it('applies the state snapshot (html, models, turns, streaming flag)', async () => {
    await mount(
      state({
        html: '<main>Live</main>',
        models: {
          image: 'bytedance-seed/seedream-4.5',
          text: 'z-ai/glm-5.2',
          vision: 'moonshotai/kimi-k2.7-code',
        },
        status: 'idle',
        turns: [priorTurn],
      }),
    )

    expect(current.html).toBe('<main>Live</main>')
    expect(current.isStreaming).toBe(false)
    expect(current.models.image).toBe('bytedance-seed/seedream-4.5')
    expect(current.models.vision).toBe('moonshotai/kimi-k2.7-code')
    expect(current.models.text).toContain('glm-5.2')
    expect(current.turns.map(({ id }) => id)).toEqual(['turn-prior'])
  })

  it('marks a project missing when the subscribe stream 404s', async () => {
    mocks.streamSSEGet.mockReset()
    mocks.streamSSEGet.mockRejectedValue(
      new Error('Request failed (404): Project not found'),
    )
    await mount()

    expect(current.missing).toBe(true)
  })

  it('keeps an in-flight turn streaming when the state snapshot rejoins mid-run', async () => {
    await mount(
      state({
        status: 'running',
        turns: [turn({ id: 'turn-live', isStreaming: true })],
      }),
    )

    expect(current.isStreaming).toBe(true)
    expect(current.turns[0]).toMatchObject({
      id: 'turn-live',
      isStreaming: true,
    })
  })
})

describe('useLandingPage run lifecycle', () => {
  it('POSTs sendPrompt, appends an optimistic turn, and applies live events from the subscribe stream', async () => {
    mocks.sendPrompt.mockResolvedValue({ status: 'running', turnId: 'turn-1' })
    await mount(state())

    await act(async () => {
      current.send({ prompt: 'Build it' })
      await flushAsyncWork()
    })

    expect(mocks.sendPrompt).toHaveBeenCalledOnce()
    expect(current.isStreaming).toBe(true)
    expect(current.turns).toHaveLength(1)
    expect(current.turns[0]?.prompt).toBe('Build it')

    act(() => {
      subscribeOnEvent({ data: { delta: 'Working' }, event: 'text' })
      subscribeOnEvent({
        data: {
          cost: 0.01,
          durationMs: 5,
          finishReason: 'stop',
          model: 'z-ai/glm-5.2',
          usage: { totalTokens: 10 },
        },
        event: 'stats',
      })
      subscribeOnEvent({ data: {}, event: 'done' })
    })

    expect(current.isStreaming).toBe(false)
    expect(current.turns[0]?.parts).toEqual([
      expect.objectContaining({ text: 'Working', type: 'text' }),
      expect.objectContaining({ finishReason: 'stop', type: 'stats' }),
    ])
  })

  it('rolls back the optimistic turn to an error when sendPrompt rejects', async () => {
    mocks.sendPrompt.mockRejectedValue(new Error('A run is already active.'))
    await mount(state())

    await act(async () => {
      current.send({ prompt: 'Build it' })
      await flushAsyncWork()
    })

    expect(current.isStreaming).toBe(false)
    expect(current.turns[0]).toMatchObject({
      error: 'A run is already active.',
      isStreaming: false,
    })
  })

  it('blocks duplicate sends before streaming state rerenders', async () => {
    await mount(state())

    act(() => {
      current.send({ prompt: 'First' })
      current.send({ prompt: 'Duplicate' })
    })
    await act(async () => flushAsyncWork())

    expect(mocks.sendPrompt).toHaveBeenCalledOnce()
    expect(current.turns).toHaveLength(1)
  })

  it('gracefully stops: terminalizes active tools, POSTs /stop, drains terminal events from subscribe', async () => {
    mocks.stopProjectAgent.mockResolvedValue(true)
    await mount(state())

    await act(async () => {
      current.send({ prompt: 'Build it' })
      await flushAsyncWork()
    })

    act(() => current.stop())
    expect(mocks.stopProjectAgent).toHaveBeenCalledOnce()
    // Immediate visual feedback while the server flushes terminal cost/stats.
    expect(current.isStreaming).toBe(true)
    expect(current.turns[0]).toMatchObject({
      isStreaming: false,
      stopped: true,
    })

    // A send while still draining is blocked.
    act(() => current.send({ prompt: 'Must stay blocked' }))
    expect(mocks.sendPrompt).toHaveBeenCalledOnce()

    // Subscribe delivers the terminal events; the run finalizes.
    act(() => {
      subscribeOnEvent({
        data: {
          cost: 0.01,
          durationMs: 250,
          finishReason: 'stopped',
          model: 'z-ai/glm-5.2',
          usage: { totalTokens: 10 },
        },
        event: 'stats',
      })
      subscribeOnEvent({ data: { message: 'stopped' }, event: 'error' })
      subscribeOnEvent({ data: {}, event: 'done' })
    })

    expect(current.isStreaming).toBe(false)
    expect(current.turns[0]).toMatchObject({ stopped: true })
    expect(current.turns[0]?.error).toBeUndefined()
  })

  it('applies live html_update events to the preview html', async () => {
    await mount(state({ html: '<main>Initial</main>' }))

    await act(async () => {
      current.send({ prompt: 'Build it' })
      await flushAsyncWork()
    })

    act(() => {
      subscribeOnEvent({
        data: {
          bytes: 20,
          hash: 'h2',
          html: '<main>Updated</main>',
          previousHash: 'h1',
          projectId: 'p1',
          sequence: 1,
        },
        event: 'html_update',
      })
    })

    expect(current.html).toBe('<main>Updated</main>')
  })

  it('enriches analyze-image tool args with the submitted attachment data URLs', async () => {
    await mount(state())

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

    act(() => {
      subscribeOnEvent({
        data: {
          action: 'Analyze attached visual reference',
          detail: 'Analyze attached visual reference\nwireframe.png',
          id: 'tool-1-analyze_image',
          state: 'running',
          tool: 'analyze_image',
        },
        event: 'tool_call',
      })
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

/** Render the harness and emit an initial `state` event through the mocked
 *  subscribe stream. Omit `initialState` for a 404/missing scenario. */
async function mount(initialState?: AgentEventSubscription): Promise<void> {
  await act(async () => {
    root.render(
      <Harness onError={vi.fn<(message: string) => void>()} projectId="p1" />,
    )
    await flushAsyncWork()
  })
  if (initialState) {
    act(() => subscribeOnEvent({ data: initialState, event: 'state' }))
  }
}

function state(
  overrides: Partial<AgentEventSubscription> = {},
): AgentEventSubscription {
  return {
    html: '<main>Initial</main>',
    models: { image: '', text: 'z-ai/glm-5.2', vision: '' },
    runStartedAt: null,
    runTurnId: null,
    status: 'idle',
    turns: [],
    ...overrides,
  }
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
