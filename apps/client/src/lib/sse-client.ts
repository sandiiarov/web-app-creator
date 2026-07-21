/**
 * Minimal SSE client. `streamSSE` does a POST with a JSON body (the agent
 * control RPC); `streamSSEGet` opens a long-lived GET subscribe stream (project
 * events). Both parse `text/event-stream` frames and invoke `onEvent` for each.
 * Returns when the server ends the stream; the caller can cancel via `signal`.
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
  return readSseResponse(response, onEvent)
}

export async function streamSSEGet(
  url: string,
  { onEvent, signal }: StreamSSEOptions,
): Promise<void> {
  const response = await fetch(url, { signal })
  return readSseResponse(response, onEvent)
}

async function readSseResponse(
  response: Response,
  onEvent: (event: SSEEvent) => void,
): Promise<void> {
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
