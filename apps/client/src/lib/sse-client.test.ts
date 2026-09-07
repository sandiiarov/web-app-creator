import {
  PROTOCOL_MAX_DOCUMENT_EVENT_FRAME_BYTES,
  PROTOCOL_MAX_DOCUMENT_BYTES,
  PROTOCOL_MAX_EVENT_DATA_BYTES,
} from '@workspace/contracts'
import { describe, expect, it, vi } from 'vitest'

import { readSseResponse, type SSEEvent } from './sse-client'

function responseFrom(chunks: string[]) {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
        controller.close()
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  )
}

describe('SSE parser', () => {
  it('parses fragmented CRLF frames, multiline JSON, ids, and ignores heartbeats', async () => {
    const events = vi.fn<(event: SSEEvent) => void>()
    await readSseResponse(
      responseFrom([
        ': heart',
        'beat\r\n\r\nid: 7\r\nevent: project_event\r\ndata: {"version":2,\r\ndata: "ok":true}\r\n\r\n',
      ]),
      { onEvent: events, signal: new AbortController().signal },
    )
    expect(events).toHaveBeenCalledOnce()
    expect(events).toHaveBeenCalledWith({
      data: { ok: true, version: 2 },
      event: 'project_event',
      id: '7',
    })
  })

  it('rejects incomplete, malformed, and oversized event data', async () => {
    await expect(
      readSseResponse(responseFrom(['event: state\ndata: {']), {
        onEvent() {},
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_FRAME',
      options: { fatal: false },
    })
    await expect(
      readSseResponse(responseFrom(['event: state\ndata: nope\n\n']), {
        onEvent() {},
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_FRAME' })
    const payload = JSON.stringify('x'.repeat(PROTOCOL_MAX_EVENT_DATA_BYTES))
    await expect(
      readSseResponse(responseFrom([`event: message\ndata: ${payload}\n\n`]), {
        onEvent() {},
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'TOO_LARGE' })
  })

  it('cancels unread response data after a fatal frame or handler failure', async () => {
    for (const fail of ['frame', 'handler'] as const) {
      const cancelled = vi.fn<(reason?: unknown) => void>()
      const response = new Response(
        new ReadableStream({
          cancel: cancelled,
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                fail === 'frame'
                  ? 'event: state\ndata: nope\n\n'
                  : 'event: state\ndata: {}\n\n',
              ),
            )
          },
        }),
      )
      await expect(
        readSseResponse(response, {
          onEvent() {
            if (fail === 'handler') throw new Error('schema rejected')
          },
          signal: new AbortController().signal,
        }),
      ).rejects.toMatchObject({
        code: 'INVALID_FRAME',
        options: { fatal: true },
      })
      expect(cancelled).toHaveBeenCalledOnce()
    }
  })

  it('cancels an unread response when the signal was already aborted', async () => {
    const cancelled = vi.fn<(reason?: unknown) => void>()
    const controller = new AbortController()
    controller.abort()
    const response = new Response(
      new ReadableStream({
        cancel: cancelled,
      }),
    )

    await expect(
      readSseResponse(response, {
        onEvent() {},
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(cancelled).toHaveBeenCalledOnce()
  })

  it('caps each complete frame independently and applies the ordinary event limit after parsing', async () => {
    const events = vi.fn<(event: SSEEvent) => void>()
    const half = 'x'.repeat(Math.floor(PROTOCOL_MAX_EVENT_DATA_BYTES * 0.6))
    await readSseResponse(
      responseFrom([
        `event: message\ndata: ${JSON.stringify(half)}\n\nevent: message\ndata: ${JSON.stringify(half)}\n\n`,
      ]),
      { onEvent: events, signal: new AbortController().signal },
    )
    expect(events).toHaveBeenCalledTimes(2)

    const oversizedText = {
      payload: { delta: 'x'.repeat(PROTOCOL_MAX_EVENT_DATA_BYTES) },
      projectId: 'project-1',
      seq: 1,
      ts: 'now',
      turnId: 'turn-1',
      type: 'text',
      version: 2,
    }
    await expect(
      readSseResponse(
        responseFrom([
          `event: project_event\ndata: ${JSON.stringify(oversizedText)}\n\n`,
        ]),
        { onEvent() {}, signal: new AbortController().signal },
      ),
    ).rejects.toMatchObject({ code: 'TOO_LARGE' })
  })

  it('measures document event limits against the complete encoded frame', async () => {
    const frameFor = (html: string) =>
      `event: project_event\ndata: ${JSON.stringify({
        payload: { html },
        type: 'document_changed',
      })}\n\n`
    const remaining =
      PROTOCOL_MAX_DOCUMENT_EVENT_FRAME_BYTES - frameFor('').length
    const padding =
      '\0'.repeat(Math.floor(remaining / 6)) + 'x'.repeat(remaining % 6)
    const frame = frameFor(padding)
    expect(new TextEncoder().encode(frame)).toHaveLength(
      PROTOCOL_MAX_DOCUMENT_EVENT_FRAME_BYTES,
    )
    const onEvent = vi.fn<(event: SSEEvent) => void>()

    await readSseResponse(responseFrom([frame]), {
      onEvent,
      signal: new AbortController().signal,
    })
    expect(onEvent).toHaveBeenCalledOnce()

    await expect(
      readSseResponse(responseFrom([frameFor(`${padding}x`)]), {
        onEvent() {},
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'TOO_LARGE' })
  })

  it('rejects raw snapshot and live document HTML above the shared limit', async () => {
    const html = 'x'.repeat(PROTOCOL_MAX_DOCUMENT_BYTES + 1)
    for (const frame of [
      `event: state\ndata: ${JSON.stringify({ html })}\n\n`,
      `event: project_event\ndata: ${JSON.stringify({
        payload: { html },
        type: 'document_changed',
      })}\n\n`,
    ]) {
      await expect(
        readSseResponse(responseFrom([frame]), {
          onEvent() {},
          signal: new AbortController().signal,
        }),
      ).rejects.toMatchObject({ code: 'TOO_LARGE' })
    }
  })

  it('classifies missing and forbidden streams as fatal HTTP errors', async () => {
    for (const status of [403, 404]) {
      await expect(
        readSseResponse(new Response('no', { status }), {
          onEvent() {},
          signal: new AbortController().signal,
        }),
      ).rejects.toMatchObject({
        code: 'HTTP',
        options: { fatal: true, status },
      })
    }
  })
})
