import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { handleModelGateway } from './model-gateway.ts'
import { createChatSandboxRegistry } from './sandbox-chat-registry.ts'
import { createTestConfig } from './test-helpers.ts'

describe('handleModelGateway', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rejects requests without a registered gateway token', async () => {
    const response = createResponse()

    await handleModelGateway({
      config: createTestConfig(),
      registry: createChatSandboxRegistry(),
      request: createRequest('bad-token'),
      response: response as unknown as ServerResponse,
    })

    expect(response.statusCode).toBe(401)
    expect(response.body).toBe(
      JSON.stringify({
        error: 'Unauthorized model gateway request.',
        ok: false,
      }),
    )
  })

  it('forwards authorized requests to OpenRouter with the host API key', async () => {
    const registry = createChatSandboxRegistry({ tokenFactory: () => 'token' })
    registry.create('/tmp/workspace')
    const response = createResponse()
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ choices: [] }, { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await handleModelGateway({
      config: createTestConfig(),
      registry,
      request: createRequest('token', '{"stream":false}'),
      response: response as unknown as ServerResponse,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        body: '{"stream":false}',
        headers: expect.objectContaining({
          authorization: 'Bearer test-openrouter-key',
        }),
        method: 'POST',
      }),
    )
    expect(response.statusCode).toBe(200)
  })
})

function createRequest(token: string, body = '{}'): IncomingMessage {
  const request = Readable.from([body]) as Readable & {
    headers: Record<string, string>
  }
  request.headers = {
    accept: 'text/event-stream',
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  }

  return request as unknown as IncomingMessage
}

function createResponse() {
  return {
    body: '',
    end(chunk?: string) {
      if (chunk) {
        this.body += chunk
      }
    },
    headers: undefined as Record<string, string> | undefined,
    statusCode: 0,
    write(chunk: Uint8Array) {
      this.body += Buffer.from(chunk).toString('utf8')
    },
    writeHead(statusCode: number, headers?: Record<string, string>) {
      this.statusCode = statusCode
      this.headers = headers
    },
  }
}
