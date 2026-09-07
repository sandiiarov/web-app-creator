import {
  PROTOCOL_MAX_DOCUMENT_EVENT_FRAME_BYTES,
  PROTOCOL_MAX_DOCUMENT_BYTES,
  PROTOCOL_MAX_EVENT_DATA_BYTES,
  PROTOCOL_MAX_FRAME_BYTES,
  PROTOCOL_MAX_LIST_SNAPSHOT_FRAME_BYTES,
  PROTOCOL_MAX_PROJECT_SNAPSHOT_FRAME_BYTES,
} from '@workspace/contracts'

export interface SSEEvent {
  data: unknown
  event: string
  id?: string
}

export type SSETransportErrorCode =
  | 'HTTP'
  | 'INVALID_FRAME'
  | 'MISSING_BODY'
  | 'TOO_LARGE'

export interface StreamSSEOptions {
  fetch?: typeof globalThis.fetch
  onBytes?: () => void
  onEvent: (event: SSEEvent) => void
  signal: AbortSignal
}

export class SSETransportError extends Error {
  readonly code: SSETransportErrorCode
  readonly options: { fatal: boolean; status?: number }

  constructor(
    code: SSETransportErrorCode,
    message: string,
    options: { fatal: boolean; status?: number } = { fatal: false },
  ) {
    super(message)
    this.code = code
    this.name = 'SSETransportError'
    this.options = options
  }
}

export async function readSseResponse(
  response: Response,
  { onBytes, onEvent, signal }: Omit<StreamSSEOptions, 'fetch'>,
): Promise<void> {
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new SSETransportError(
      'HTTP',
      `Request failed (${response.status}): ${text || response.statusText}`,
      {
        fatal: response.status === 403 || response.status === 404,
        status: response.status,
      },
    )
  }
  if (!response.body) {
    throw new SSETransportError('MISSING_BODY', 'SSE response has no body.', {
      fatal: false,
    })
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  const encoder = new TextEncoder()
  let buffer = ''
  let completed = false
  const abort = () => void reader.cancel(signal.reason).catch(() => {})
  signal.addEventListener('abort', abort, { once: true })
  try {
    if (signal.aborted) {
      await reader.cancel(signal.reason)
      signal.throwIfAborted()
    }
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      signal.throwIfAborted()
      if (value.byteLength > 0) onBytes?.()
      try {
        buffer += decoder.decode(value, { stream: true })
      } catch {
        throw new SSETransportError(
          'INVALID_FRAME',
          'SSE data is not valid UTF-8.',
          { fatal: true },
        )
      }
      buffer = consumeFrames(buffer, onEvent, encoder)
      if (encoder.encode(buffer).byteLength > PROTOCOL_MAX_FRAME_BYTES) {
        throw new SSETransportError(
          'TOO_LARGE',
          'SSE frame exceeds the absolute limit.',
          { fatal: true },
        )
      }
    }
    try {
      buffer += decoder.decode()
    } catch {
      throw new SSETransportError(
        'INVALID_FRAME',
        'SSE data ended inside a UTF-8 sequence.',
        { fatal: false },
      )
    }
    buffer = consumeFrames(buffer, onEvent, encoder)
    if (buffer.replace(/\r/g, '').trim()) {
      throw new SSETransportError(
        'INVALID_FRAME',
        'SSE response ended inside a frame.',
        { fatal: false },
      )
    }
    completed = true
  } finally {
    signal.removeEventListener('abort', abort)
    if (!completed) await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export async function streamSSEGet(
  url: string,
  {
    fetch: fetchImpl = globalThis.fetch,
    onBytes,
    onEvent,
    signal,
  }: StreamSSEOptions,
): Promise<void> {
  const response = await fetchImpl(url, { signal })
  await readSseResponse(response, { onBytes, onEvent, signal })
}

function assertRawDocumentSize(
  event: string,
  data: unknown,
  encoder: TextEncoder,
) {
  const html =
    event === 'state' && isRecord(data)
      ? data.html
      : event === 'project_event' &&
          isRecord(data) &&
          data.type === 'document_changed' &&
          isRecord(data.payload)
        ? data.payload.html
        : undefined
  if (
    typeof html === 'string' &&
    encoder.encode(html).byteLength > PROTOCOL_MAX_DOCUMENT_BYTES
  ) {
    throw new SSETransportError(
      'TOO_LARGE',
      'Document HTML exceeds its limit.',
      { fatal: true },
    )
  }
}

function consumeFrames(
  input: string,
  onEvent: (event: SSEEvent) => void,
  encoder: TextEncoder,
): string {
  let buffer = input
  while (true) {
    const match = /\r?\n\r?\n/.exec(buffer)
    if (!match || match.index === undefined) return buffer
    const frame = buffer.slice(0, match.index)
    const encodedFrame = frame + match[0]
    buffer = buffer.slice(match.index + match[0].length)
    if (encoder.encode(encodedFrame).byteLength > PROTOCOL_MAX_FRAME_BYTES) {
      throw new SSETransportError(
        'TOO_LARGE',
        'SSE frame exceeds the absolute limit.',
        { fatal: true },
      )
    }
    const parsed = parseFrame(frame)
    if (!parsed) continue
    let data: unknown
    try {
      data = JSON.parse(parsed.dataText)
    } catch {
      throw new SSETransportError(
        'INVALID_FRAME',
        'SSE data is not valid JSON.',
        { fatal: true },
      )
    }
    assertRawDocumentSize(parsed.event, data, encoder)
    const limit = frameLimit(parsed.event, data)
    const measured = limit.unit === 'frame' ? encodedFrame : parsed.dataText
    if (encoder.encode(measured).byteLength > limit.bytes) {
      throw new SSETransportError(
        'TOO_LARGE',
        `${parsed.event} ${limit.unit} exceeds its limit.`,
        { fatal: true },
      )
    }
    try {
      onEvent({
        data,
        event: parsed.event,
        ...(parsed.id ? { id: parsed.id } : {}),
      })
    } catch (error) {
      if (error instanceof SSETransportError) throw error
      throw new SSETransportError(
        'INVALID_FRAME',
        error instanceof Error ? error.message : 'SSE event validation failed.',
        { fatal: true },
      )
    }
  }
}

function frameLimit(
  event: string,
  data: unknown,
): { bytes: number; unit: 'data' | 'frame' } {
  if (event === 'state')
    return { bytes: PROTOCOL_MAX_PROJECT_SNAPSHOT_FRAME_BYTES, unit: 'frame' }
  if (event === 'list_state')
    return { bytes: PROTOCOL_MAX_LIST_SNAPSHOT_FRAME_BYTES, unit: 'frame' }
  if (
    event === 'project_event' &&
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    data.type === 'document_changed'
  )
    return { bytes: PROTOCOL_MAX_DOCUMENT_EVENT_FRAME_BYTES, unit: 'frame' }
  return { bytes: PROTOCOL_MAX_EVENT_DATA_BYTES, unit: 'data' }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseFrame(
  frame: string,
): null | { dataText: string; event: string; id?: string } {
  let event = 'message'
  let id: string | undefined
  const data: string[] = []
  for (const rawLine of frame.split(/\r?\n/)) {
    if (rawLine.startsWith(':')) continue
    const separator = rawLine.indexOf(':')
    const field = separator === -1 ? rawLine : rawLine.slice(0, separator)
    let value = separator === -1 ? '' : rawLine.slice(separator + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') event = value
    else if (field === 'id') id = value
    else if (field === 'data') data.push(value)
  }
  if (data.length === 0) return null
  return {
    dataText: data.join('\n'),
    event,
    ...(id === undefined ? {} : { id }),
  }
}
