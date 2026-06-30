import type { ServerResponse } from 'node:http'

/** Write one SSE event: `event: <type>\ndata: <json>\n\n`. */
export function sendSse(response: ServerResponse, event: string, payload: unknown) {
  response.write(`event: ${event}\n`)
  response.write(`data: ${JSON.stringify(payload)}\n\n`)
}

/** Begin an SSE response stream. */
export function startSse(response: ServerResponse, statusCode = 200) {
  response.writeHead(statusCode, {
    'cache-control': 'no-cache',
    connection: 'keep-alive',
    'content-type': 'text/event-stream; charset=utf-8',
  })
}
