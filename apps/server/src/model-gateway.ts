import type { IncomingMessage, ServerResponse } from 'node:http'

import type { Config } from './config-env.ts'
import { readRequestBody } from './http-body.ts'
import type { ChatSandboxRegistry } from './sandbox-chat-registry.ts'

const OPENROUTER_CHAT_COMPLETIONS_URL =
  'https://openrouter.ai/api/v1/chat/completions'

export type HandleModelGatewayOptions = {
  config: Config
  registry: ChatSandboxRegistry
  request: IncomingMessage
  response: ServerResponse
}

export async function handleModelGateway({
  config,
  registry,
  request,
  response,
}: HandleModelGatewayOptions) {
  const token = bearerToken(request.headers.authorization)

  if (!registry.findByGatewayToken(token)) {
    sendGatewayJson(response, 401, {
      error: 'Unauthorized model gateway request.',
      ok: false,
    })
    return
  }

  const upstream = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
    body: await readRequestBody(request),
    headers: {
      accept: request.headers.accept ?? 'text/event-stream',
      authorization: `Bearer ${config.ai.key}`,
      'content-type': request.headers['content-type'] ?? 'application/json',
      'http-referer': config.app.url,
      'x-title': config.app.name,
    },
    method: 'POST',
  })

  response.writeHead(upstream.status, {
    'cache-control': 'no-cache',
    'content-type':
      upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
  })

  if (!upstream.body) {
    response.end()
    return
  }

  for await (const chunk of upstream.body) {
    response.write(chunk)
  }

  response.end()
}

function bearerToken(authorization: string | undefined) {
  const prefix = 'Bearer '

  return authorization?.startsWith(prefix)
    ? authorization.slice(prefix.length)
    : undefined
}

function sendGatewayJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(payload))
}
