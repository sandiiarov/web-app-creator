import type { ViteDevServer } from 'almostnode'
import { describe, expect, it, vi } from 'vitest'

import { createBridgeServer } from './preview-bridge'

describe('createBridgeServer', () => {
  it('adapts a Vite dev server to the almostnode bridge shape', () => {
    const devServer = {
      getPort: () => 5174,
      handleRequest: vi.fn<() => string>(() => 'response'),
    } as unknown as ViteDevServer

    const server = createBridgeServer(devServer)

    expect(server.listening).toBe(true)
    expect(server.address()).toEqual({
      address: '0.0.0.0',
      family: 'IPv4',
      port: 5174,
    })
    expect(server.handleRequest('GET', '/', {}, undefined)).toBe('response')
    expect(devServer.handleRequest).toHaveBeenCalledWith(
      'GET',
      '/',
      {},
      undefined,
    )
  })

  it('normalizes string request bodies to buffers', () => {
    const devServer = {
      getPort: () => 5174,
      handleRequest: vi.fn<() => undefined>(),
    } as unknown as ViteDevServer
    const server = createBridgeServer(devServer)

    server.handleRequest('POST', '/submit', {}, 'payload')

    const body = vi.mocked(devServer.handleRequest).mock.calls[0]?.[3]
    expect(body).toBeDefined()
    expect(String(body)).toBe('payload')
  })
})
