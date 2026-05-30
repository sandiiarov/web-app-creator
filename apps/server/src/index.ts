import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { env } from 'node:process'

import { gateway } from '@ai-sdk/gateway'
import { generateText } from 'ai'

const CLIENT_ORIGIN = env.CLIENT_ORIGIN ?? '*'
const DEFAULT_MODEL = env.AI_MODEL ?? 'openai/gpt-4o-mini'
const HOST = env.HOST ?? '0.0.0.0'
const PORT = parsePort(env.PORT ?? '3001')

type GenerateRequest = {
  model?: string
  prompt: string
}

const server = createServer(async (request, response) => {
  setCorsHeaders(response)

  try {
    await routeRequest(request, response)
  } catch (error) {
    sendJson(response, 500, {
      error: errorMessage(error),
    })
  }
})

server.listen(PORT, HOST, () => {
  console.log(`Server listening at http://${HOST}:${PORT}`)
})

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error'
}

async function generateCompletion({ model, prompt }: GenerateRequest) {
  const result = await generateText({
    model: gateway(model ?? DEFAULT_MODEL),
    prompt,
  })

  return result.text
}

async function handleGenerate(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const body = await readJson(request)

  if (!isGenerateRequest(body)) {
    sendJson(response, 400, {
      error: 'Expected JSON body with a string prompt.',
    })
    return
  }

  const text = await generateCompletion(body)

  sendJson(response, 200, {
    text,
  })
}

function handleHealth(response: ServerResponse) {
  sendJson(response, 200, {
    aiGatewayConfigured: Boolean(env.AI_GATEWAY_API_KEY),
    ok: true,
  })
}

function hasOptionalModel(value: unknown) {
  return value === undefined || typeof value === 'string'
}

function hasPrompt(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
}

function isGenerateRequest(value: unknown): value is GenerateRequest {
  if (!isRecord(value)) {
    return false
  }

  return hasPrompt(value.prompt) && hasOptionalModel(value.model)
}

function isGenerateRoute(request: IncomingMessage, pathname: string) {
  return request.method === 'POST' && pathname === '/api/generate'
}

function isHealthRoute(request: IncomingMessage, pathname: string) {
  return request.method === 'GET' && pathname === '/health'
}

function isOptionsRequest(request: IncomingMessage) {
  return request.method === 'OPTIONS'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parsePort(value: string) {
  const port = Number(value)

  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`Invalid PORT value: ${value}`)
  }

  return port
}

async function readJson(request: IncomingMessage) {
  const body = await readRequestBody(request)

  return body.trim().length > 0 ? (JSON.parse(body) as unknown) : {}
}

async function readRequestBody(request: IncomingMessage) {
  const chunks: Buffer[] = []

  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }

  return Buffer.concat(chunks).toString('utf8')
}

function requestPathname(request: IncomingMessage) {
  return new URL(request.url ?? '/', `http://${request.headers.host}`).pathname
}

async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse,
) {
  if (isOptionsRequest(request)) {
    sendNoContent(response)
    return
  }

  const pathname = requestPathname(request)

  if (isHealthRoute(request, pathname)) {
    handleHealth(response)
    return
  }

  if (isGenerateRoute(request, pathname)) {
    await handleGenerate(request, response)
    return
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
  sendJson(response, 404, {
    error: 'Not found',
  })
}

function setCorsHeaders(response: ServerResponse) {
  response.setHeader('access-control-allow-headers', 'content-type')
  response.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS')
  response.setHeader('access-control-allow-origin', CLIENT_ORIGIN)
}
