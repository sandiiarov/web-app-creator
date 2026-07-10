import type { ServerResponse } from 'node:http'

/** Best-effort SSE closure. Returns whether `end` was attempted successfully. */
export function endSse(response: ServerResponse): boolean {
  if (!isWritable(response)) return false
  try {
    response.end()
    return true
  } catch {
    return false
  }
}

/** Best-effort write of one `event: <type>\ndata: <json>\n\n` SSE frame. */
export function sendSse(
  response: ServerResponse,
  event: string,
  payload: unknown,
): boolean {
  if (!isWritable(response)) return false
  try {
    response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
    return true
  } catch {
    return false
  }
}

/** Best-effort start of an SSE response stream. */
export function startSse(response: ServerResponse, statusCode = 200): boolean {
  if (!isWritable(response)) return false
  try {
    response.writeHead(statusCode, {
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'content-type': 'text/event-stream; charset=utf-8',
    })
    return true
  } catch {
    return false
  }
}

function isWritable(response: ServerResponse): boolean {
  return !response.destroyed && !response.writableEnded
}
