/**
 * Minimal SSE client for POST requests. Parses `text/event-stream` frames and
 * invokes `onEvent(event, data)` for each. Returns an AbortController so the
 * caller can cancel the stream.
 */
export interface SSEEvent {
  data: unknown
  event: string
}

export interface StreamSSEOptions {
  onEvent: (event: SSEEvent) => void
  signal: AbortSignal
}

export async function streamSSE(
  url: string,
  body: unknown,
  { onEvent, signal }: StreamSSEOptions,
): Promise<void> {
  const response = await fetch(url, {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
    signal,
  })

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => '')
    throw new Error(
      `Request failed (${response.status}): ${text || response.statusText}`,
    )
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    while (true) {
      const frameEnd = buffer.indexOf('\n\n')
      if (frameEnd === -1) break

      const frame = buffer.slice(0, frameEnd)
      buffer = buffer.slice(frameEnd + 2)

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

      onEvent({ data, event })
    }
  }
}
