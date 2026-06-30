import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { fileURLToPath } from 'node:url'

import { config } from './config.ts'
import { readRequestBody } from './http-body.ts'
import { getImage } from './mastra/lib/image-store.ts'
import { resolveModelId, streamLandingAgent } from './mastra/route.ts'

type AgentRequestBody = { model?: string; prompt?: unknown }

const server = createServer(async (request, response) => {
  setCorsHeaders(response)

  try {
    await routeRequest(request, response)
  } catch (error) {
    if (!response.headersSent) {
      sendJson(response, 500, { error: errorMessage(error), ok: false })
    } else {
      response.end()
    }
  }
})

// Only start our custom HTTP server when run directly (`node src/index.ts`),
// not when Mastra dev/build imports this module as a library entry point.
const isMainModule =
  process.argv[1] === fileURLToPath(import.meta.url) ||
  process.argv[1]?.endsWith('src/index.ts')

if (isMainModule) {
  server.listen(config.port, config.host, () => {
    console.log(`Server listening at http://${config.host}:${config.port}`)
  })
}

export { server }

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error'
}

/**
 * Single landing-page-agent endpoint. Accepts `{ prompt: string, model?: string }`.
 *
 * The Mastra agent + custom SSE protocol wire in here — see
 * `mastra-migration-plan.md`, Phase 2.
 */
async function handleAgent(request: IncomingMessage, response: ServerResponse) {
  const body = await readJson(request)

  if (typeof body.prompt !== 'string' || body.prompt.trim() === '') {
    sendJson(response, 400, {
      error: 'Expected { prompt: string }',
      ok: false,
    })
    return
  }

  if (body.model !== undefined && typeof body.model !== 'string') {
    sendJson(response, 400, {
      error: 'Expected { model?: string }',
      ok: false,
    })
    return
  }

  await streamLandingAgent({
    modelId: resolveModelId(body.model),
    prompt: body.prompt,
    request,
    response,
  })
}

async function readJson(request: IncomingMessage): Promise<AgentRequestBody> {
  const body = await readRequestBody(request)

  return body.trim().length > 0 ? (JSON.parse(body) as AgentRequestBody) : {}
}

function requestPathname(request: IncomingMessage) {
  return new URL(request.url ?? '/', `http://${request.headers.host}`).pathname
}

async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse,
) {
  if (request.method === 'OPTIONS') {
    sendNoContent(response)
    return
  }

  const pathname = requestPathname(request)

  if (request.method === 'POST' && pathname === '/agent') {
    await handleAgent(request, response)
    return
  }

  if (request.method === 'GET') {
    const imageMatch = pathname.match(/^\/images\/(img-\d+)(?:\.[a-z0-9]+)?$/i)
    if (imageMatch) {
      serveImage(imageMatch[1]!, response)
      return
    }
  }

  sendNotFound(response)
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(payload))
}

function sendNoContent(response: ServerResponse) {
  response.writeHead(204)
  response.end()
}

function sendNotFound(response: ServerResponse) {
  sendJson(response, 404, { error: 'Not found', ok: false })
}

function serveImage(id: string, response: ServerResponse) {
  const image = getImage(id)

  if (!image) {
    sendJson(response, 404, { error: 'Image not found', ok: false })
    return
  }

  response.writeHead(200, {
    'cache-control': 'public, max-age=86400, immutable',
    'content-length': image.buffer.length,
    'content-type': image.mediaType,
  })
  response.end(image.buffer)
}

function setCorsHeaders(response: ServerResponse) {
  response.setHeader('access-control-allow-headers', 'content-type')
  response.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS')
  response.setHeader('access-control-allow-origin', config.clientOrigin)
}
