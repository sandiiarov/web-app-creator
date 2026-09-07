// @vitest-environment happy-dom

import type {
  LandingAgentSendResult,
  LandingTurn,
} from '@workspace/prompt-panel'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  AgentEventSubscription,
  ProjectMeta,
  SendPromptResult,
} from '../lib/projects-api'
import {
  SSETransportError,
  type SSEEvent,
  type StreamSSEOptions,
} from '../lib/sse-client'
import { useLandingPage, type UseLandingPage } from './use-landing-page'

const mocks = vi.hoisted(() => ({
  sendPrompt: vi
    .fn<(input: unknown) => Promise<SendPromptResult>>()
    .mockResolvedValue({
      outcome: 'accepted',
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

vi.mock('../lib/sse-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/sse-client')>()),
  streamSSEGet: mocks.streamSSEGet,
}))

const priorTurn = turn({ id: 'turn-prior', prompt: 'Earlier' })

let container: HTMLDivElement
let current: UseLandingPage
let root: Root
let subscribeOnEvent: (event: SSEEvent) => void
let eventSeq = 0
let pendingTerminalReason: string | undefined

beforeEach(() => {
  ;(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  vi.resetAllMocks()
  eventSeq = 0
  pendingTerminalReason = undefined
  mocks.sendPrompt.mockResolvedValue({
    outcome: 'accepted',
    turnId: 'replaced',
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  mocks.streamSSEGet.mockImplementation(async (_url, options) => {
    // Subscribe stream stays open for the test; events arrive via `onEvent`.
    subscribeOnEvent = (event) => options.onEvent(toV2Event(event))
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
      new SSETransportError('HTTP', 'Project not found', {
        fatal: true,
        status: 404,
      }),
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
    mocks.sendPrompt.mockResolvedValue({
      outcome: 'accepted',
      turnId: 'turn-1',
    })
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

  it('retains an uncertain optimistic turn when the acknowledgment is lost', async () => {
    mocks.sendPrompt.mockRejectedValue(new Error('A run is already active.'))
    await mount(state())

    await act(async () => {
      expect(await current.send({ prompt: 'Build it' })).toMatchObject({
        outcome: 'unknown',
      })
      await flushAsyncWork()
    })

    expect(current.isStreaming).toBe(true)
    expect(current.turns[0]).toMatchObject({ isStreaming: true })
  })

  it('retries an uncertain immutable command with the same turn and effective inputs', async () => {
    mocks.sendPrompt
      .mockRejectedValueOnce(new Error('lost acknowledgment'))
      .mockResolvedValueOnce({ outcome: 'accepted', turnId: 'same' })
    await mount(state())
    const input = {
      attachments: [
        {
          id: 'hero-element',
          kind: 'element' as const,
          name: 'Hero',
          selector: '#hero',
        },
      ],
      prompt: 'Build it',
    }
    let first!: LandingAgentSendResult
    await act(async () => {
      first = await current.send(input)
      await flushAsyncWork()
    })
    await act(async () => {
      subscribeOnEvent({ data: state(), event: 'state' })
      await flushAsyncWork()
    })
    expect(first.outcome).toBe('unknown')
    expect(mocks.sendPrompt).toHaveBeenCalledTimes(2)
    expect(mocks.sendPrompt.mock.calls[1]?.[0]).toEqual(
      mocks.sendPrompt.mock.calls[0]?.[0],
    )
    expect(current.turns).toHaveLength(1)
  })

  it('blocks sends until a connection snapshot arrives', async () => {
    await mount()
    await act(async () => {
      expect(await current.send({ prompt: 'Too early' })).toMatchObject({
        outcome: 'rejected',
      })
    })
    expect(mocks.sendPrompt).not.toHaveBeenCalled()
  })

  it('keeps a pending POST locked when an older idle snapshot arrives', async () => {
    let accept!: (value: SendPromptResult) => void
    mocks.sendPrompt.mockImplementation(
      () =>
        new Promise((resolve) => {
          accept = resolve
        }),
    )
    await mount(state())
    let pending!: ReturnType<UseLandingPage['send']>
    act(() => {
      pending = current.send({ prompt: 'Pending request' })
    })
    act(() => {
      subscribeOnEvent({ data: state(), event: 'state' })
    })
    expect(current.isStreaming).toBe(true)
    expect(current.turns[0]?.prompt).toBe('Pending request')
    await act(async () => {
      expect(await current.send({ prompt: 'Duplicate' })).toMatchObject({
        outcome: 'rejected',
      })
    })
    await act(async () => {
      accept({ outcome: 'accepted', turnId: 'accepted' })
      expect(await pending).toMatchObject({ outcome: 'accepted' })
    })
    expect(mocks.sendPrompt).toHaveBeenCalledOnce()
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

  it('does not let a rejected local acknowledgment unlock a newer remote run', async () => {
    let resolvePost!: (value: SendPromptResult) => void
    mocks.sendPrompt.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePost = resolve
        }),
    )
    await mount(state())
    act(() => {
      void current.send({ prompt: 'Local request' })
    })
    act(() => {
      subscribeOnEvent({
        data: state({
          run: {
            blocked: false,
            startedAt: '2026-09-06T00:00:01.000Z',
            status: 'running',
            turnId: 'remote-turn',
          },
          turns: [turn({ id: 'remote-turn', isStreaming: true })],
        }),
        event: 'state',
      })
    })
    await act(async () => {
      resolvePost({ outcome: 'rejected', reason: 'overlap', turnId: 'local' })
      await flushAsyncWork()
    })
    expect(current.isStreaming).toBe(true)
    expect(
      current.turns.find((item) => item.id === 'remote-turn'),
    ).toMatchObject({ isStreaming: true })
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
    expect(current.isStopping).toBe(true)
    expect(current.turns[0]).toMatchObject({
      isStreaming: false,
      stopped: true,
    })

    // A send while still draining is blocked.
    await act(async () => {
      await current.send({ prompt: 'Must stay blocked' })
    })
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

  it('does not let duplicate events for an old turn unlock a newer active run', async () => {
    await mount(
      state({
        cursor: 1,
        run: {
          blocked: false,
          startedAt: '2026-09-06T00:00:00.000Z',
          status: 'running',
          turnId: 'turn-new',
        },
        turns: [
          turn({ id: 'turn-old' }),
          turn({ id: 'turn-new', isStreaming: true }),
        ],
      }),
    )
    act(() => {
      subscribeOnEvent({
        data: {
          payload: {
            attachments: [],
            compactionPercent: null,
            imageModel: 'image',
            model: 'text',
            prompt: 'Old',
            requestDigest: 'digest',
            requestVersion: 1,
            visionModel: 'vision',
          },
          projectId: 'p1',
          seq: 2,
          ts: '2026-09-06T00:00:01.000Z',
          turnId: 'turn-old',
          type: 'run_accepted',
          version: 2,
        },
        event: 'project_event',
      })
      subscribeOnEvent({
        data: {
          payload: {
            finishedAt: '2026-09-06T00:00:02.000Z',
            outcome: 'completed',
            stats: null,
            turnId: 'turn-old',
          },
          projectId: 'p1',
          seq: 3,
          ts: '2026-09-06T00:00:02.000Z',
          turnId: 'turn-old',
          type: 'run_terminal',
          version: 2,
        },
        event: 'project_event',
      })
    })
    expect(current.isStreaming).toBe(true)
    expect(current.turns.find((item) => item.id === 'turn-new')).toMatchObject({
      isStreaming: true,
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
  const status = overrides.status ?? overrides.run?.status ?? 'idle'
  return {
    cursor: overrides.cursor ?? 0,
    documentHash: overrides.documentHash ?? 'initial-hash',
    html: overrides.html ?? '<main>Initial</main>',
    models: overrides.models ?? { image: '', text: 'z-ai/glm-5.2', vision: '' },
    projectId: 'p1',
    run: overrides.run ?? {
      blocked: false,
      startedAt: overrides.runStartedAt ?? null,
      status,
      turnId: overrides.runTurnId ?? null,
    },
    title: overrides.title ?? 'Untitled',
    turns: overrides.turns ?? [],
    version: 2,
  }
}

function toV2Event(input: SSEEvent): SSEEvent {
  if (
    input.event === 'state' ||
    input.event === 'protocol_error' ||
    input.event === 'project_event'
  )
    return input
  const turnId = current?.turns.at(-1)?.id ?? 'turn-1'
  eventSeq += 1
  if (input.event === 'html_update') {
    const html = (input.data as { html: string }).html
    return {
      data: {
        payload: {
          bytes: new TextEncoder().encode(html).byteLength,
          hash: `hash-${eventSeq}`,
          html,
        },
        projectId: 'p1',
        seq: eventSeq,
        ts: new Date().toISOString(),
        turnId,
        type: 'document_changed',
        version: 2,
      },
      event: 'project_event',
    }
  }
  if (input.event === 'error') {
    pendingTerminalReason = String(
      (input.data as { message?: string }).message ?? 'error',
    )
    return {
      data: {
        payload: {},
        projectId: 'p1',
        seq: eventSeq,
        ts: new Date().toISOString(),
        turnId,
        type: 'checkpoint',
        version: 2,
      },
      event: 'project_event',
    }
  }
  if (input.event === 'done') {
    const reason = pendingTerminalReason
    pendingTerminalReason = undefined
    return {
      data: {
        payload: {
          finishedAt: new Date().toISOString(),
          outcome: reason
            ? reason === 'stopped'
              ? 'stopped'
              : 'error'
            : 'completed',
          ...(reason ? { reason } : {}),
          stats: null,
          turnId,
        },
        projectId: 'p1',
        seq: eventSeq,
        ts: new Date().toISOString(),
        turnId,
        type: 'run_terminal',
        version: 2,
      },
      event: 'project_event',
    }
  }
  return {
    data: {
      payload: input.data,
      projectId: 'p1',
      seq: eventSeq,
      ts: new Date().toISOString(),
      turnId: input.event === 'project_meta' ? null : turnId,
      type: input.event,
      version: 2,
    },
    event: 'project_event',
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
