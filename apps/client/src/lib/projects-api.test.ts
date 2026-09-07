import { afterEach, describe, expect, it, vi } from 'vitest'

import { sendPrompt } from './projects-api'

const command = {
  attachments: [],
  projectId: 'project-1',
  prompt: 'Build',
  turnId: 'turn-1',
}

afterEach(() => vi.unstubAllGlobals())

describe('run acknowledgment classification', () => {
  it('keeps storage, server, and network failures uncertain', async () => {
    for (const response of [
      new Response(
        JSON.stringify({
          error: 'storage uncertain',
          ok: false,
          reason: 'storage',
        }),
        { status: 409 },
      ),
      new Response('not-json', { status: 500 }),
    ]) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => response),
      )
      await expect(sendPrompt(command)).resolves.toMatchObject({
        outcome: 'unknown',
        turnId: 'turn-1',
      })
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('lost'))),
    )
    await expect(sendPrompt(command)).resolves.toMatchObject({
      outcome: 'unknown',
      turnId: 'turn-1',
    })
  })

  it('rejects explicit idempotency conflicts and accepts a committed identity', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ok: false, reason: 'conflict' }), {
            status: 409,
          }),
      ),
    )
    await expect(sendPrompt(command)).resolves.toMatchObject({
      outcome: 'rejected',
      turnId: 'turn-1',
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ ok: true, status: 'running', turnId: 'turn-1' }),
            { status: 200 },
          ),
      ),
    )
    await expect(sendPrompt(command)).resolves.toEqual({
      outcome: 'accepted',
      turnId: 'turn-1',
    })
  })

  it('classifies validated client failures as rejected acknowledgments', async () => {
    for (const [status, reason] of [
      [400, 'validation'],
      [403, 'forbidden'],
      [404, 'not_found'],
      [413, 'validation'],
    ] as const) {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(
              JSON.stringify({ error: 'Rejected command', ok: false, reason }),
              { status },
            ),
        ),
      )
      await expect(sendPrompt(command)).resolves.toMatchObject({
        outcome: 'rejected',
        turnId: 'turn-1',
      })
    }
  })
})
