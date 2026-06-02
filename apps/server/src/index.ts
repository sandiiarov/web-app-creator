import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'

import { runAgentRequest } from './agent-controller.ts'
import { parseAgentRequest, type AgentRequest } from './agent-request.ts'
import { config } from './config.ts'
import { readRequestBody } from './http-body.ts'
import { handleModelGateway } from './model-gateway.ts'
import { createChatSandboxRegistry } from './sandbox-chat-registry.ts'
import { createSbxOrchestrator } from './sbx-orchestrator.ts'

const sandboxRegistry = createChatSandboxRegistry()
const sbxOrchestrator = createSbxOrchestrator(config)

type Route = {
  handle: (
    request: IncomingMessage,
    response: ServerResponse,
  ) => Promise<void> | void
  matches: (request: IncomingMessage, pathname: string) => boolean
}

const ROUTES: Route[] = [
  {
    handle: handleHealthRoute,
    matches: isHealthRoute,
  },
  {
    handle: handleAgent,
    matches: isAgentRoute,
  },
  {
    handle: handleModelGatewayRoute,
    matches: isModelGatewayRoute,
  },
]

const server = createServer(async (request, response) => {
  setCorsHeaders(response)

  try {
    await routeRequest(request, response)
  } catch (error) {
    if (!response.headersSent) {
      sendJson(response, 500, {
        error: errorMessage(error),
        ok: false,
      })
    } else {
      response.end()
    }
  }
})

server.listen(config.port, config.host, () => {
  console.log(`Server listening at http://${config.host}:${config.port}`)
})

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error'
}

async function handleAgent(request: IncomingMessage, response: ServerResponse) {
  let agentRequest: AgentRequest

  try {
    agentRequest = parseAgentRequest(await readJson(request))
  } catch (error) {
    sendJson(response, 400, {
      error: errorMessage(error),
      ok: false,
    })
    return
  }

  const result = await runAgentRequest({
    config,
    orchestrator: sbxOrchestrator,
    registry: sandboxRegistry,
    request: agentRequest,
  })

  sendJson(response, 200, result)
}

function handleHealth(response: ServerResponse) {
  sendJson(response, 200, {
    ok: true,
    openRouterConfigured: true,
    provider: 'openrouter',
    runtime: 'pi-sdk',
  })
}

function handleHealthRoute(
  _request: IncomingMessage,
  response: ServerResponse,
) {
  handleHealth(response)
}

async function handleModelGatewayRoute(
  request: IncomingMessage,
  response: ServerResponse,
) {
  await handleModelGateway({
    config,
    registry: sandboxRegistry,
    request,
    response,
  })
}

function isAgentRoute(request: IncomingMessage, pathname: string) {
  return request.method === 'POST' && pathname === '/agent'
}

function isHealthRoute(request: IncomingMessage, pathname: string) {
  return request.method === 'GET' && pathname === '/health'
}

function isModelGatewayRoute(request: IncomingMessage, pathname: string) {
  return (
    request.method === 'POST' &&
    pathname === '/internal/model-gateway/v1/chat/completions'
  )
}

function isOptionsRequest(request: IncomingMessage) {
  return request.method === 'OPTIONS'
}

async function readJson(request: IncomingMessage) {
  const body = await readRequestBody(request)

  return body.trim().length > 0 ? (JSON.parse(body) as unknown) : {}
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
  const route = ROUTES.find((candidate) => candidate.matches(request, pathname))

  if (!route) {
    sendNotFound(response)
    return
  }

  await route.handle(request, response)
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
    ok: false,
  })
}

function setCorsHeaders(response: ServerResponse) {
  response.setHeader('access-control-allow-headers', 'content-type')
  response.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS')
  response.setHeader('access-control-allow-origin', config.clientOrigin)
}
