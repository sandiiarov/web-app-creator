import { describe, expect, it } from 'vitest'

import { createChatSandboxRegistry } from './sandbox-chat-registry.ts'

describe('createChatSandboxRegistry', () => {
  it('creates and finds chat sandboxes', () => {
    const registry = createChatSandboxRegistry({
      clock: () => 1_000,
      idFactory: () => 'chat-id',
      tokenFactory: () => 'token',
    })

    const sandbox = registry.create('/tmp/workspace')

    expect(sandbox).toMatchObject({
      chatId: 'chat-id',
      gatewayToken: 'token',
      sandboxName: 'web-app-creator-chat-id',
      status: 'creating',
      workspacePath: '/tmp/workspace',
    })
    expect(registry.find('chat-id')).toBe(sandbox)
    expect(registry.findByGatewayToken('token')).toBe(sandbox)
  })

  it('marks status and removes idle sandboxes', () => {
    let now = 1_000
    const registry = createChatSandboxRegistry({
      clock: () => now,
      idFactory: () => 'chat-id',
    })
    const sandbox = registry.create('/tmp/workspace')

    expect(registry.markStatus('chat-id', 'ready')).toBe(sandbox)
    expect(sandbox.status).toBe('ready')

    now = 2_500

    expect(registry.removeIdle(1_000)).toEqual([sandbox])
    expect(registry.find('chat-id')).toBeUndefined()
  })
})
