import { describe, expect, it } from 'vitest'

import { cleanupIdleSandboxes, runAgentRequest } from './agent-controller.ts'
import type { AgentResponse } from './agent-request.ts'
import { createChatSandboxRegistry } from './sandbox-chat-registry.ts'
import type { SbxOrchestrator } from './sbx-orchestrator.ts'
import { createTestConfig } from './test-helpers.ts'

const agentResponse: AgentResponse = {
  changedFiles: [],
  chatId: 'runner-chat-id',
  deletedPaths: [],
  diagnostics: [],
  message: 'done',
  ok: true,
}

describe('cleanupIdleSandboxes', () => {
  it('disposes sandboxes idle past the configured TTL', async () => {
    let now = 0
    const registry = createChatSandboxRegistry({ clock: () => now })
    const sandbox = registry.create('/tmp/workspace')
    const disposed: string[] = []
    const orchestrator = createOrchestrator({
      disposeSandbox: async (sandbox) => {
        disposed.push(sandbox.chatId)
      },
    })
    now = 901_000

    const removed = await cleanupIdleSandboxes({
      config: createTestConfig(),
      orchestrator,
      registry,
    })

    expect(removed).toEqual([sandbox])
    expect(disposed).toEqual([sandbox.chatId])
    expect(registry.find(sandbox.chatId)).toBeUndefined()
  })
})

describe('runAgentRequest', () => {
  it('creates a sandbox for a new chat and returns the registered chat id', async () => {
    const registry = createChatSandboxRegistry({
      idFactory: () => 'chat-id',
      tokenFactory: () => 'token',
    })
    const created: string[] = []
    const orchestrator = createOrchestrator({
      createSandbox: async (sandbox) => {
        created.push(sandbox.chatId)
      },
    })

    const response = await runAgentRequest({
      config: createTestConfig(),
      orchestrator,
      registry,
      request: {
        files: [],
        prompt: 'hello',
        version: 1,
      },
    })

    expect(created).toEqual(['chat-id'])
    expect(response).toEqual({
      ...agentResponse,
      chatId: 'chat-id',
    })
  })

  it('reuses an existing sandbox for a known chat id', async () => {
    const registry = createChatSandboxRegistry({ idFactory: () => 'chat-id' })
    registry.create('/tmp/workspace')
    const created: string[] = []
    const orchestrator = createOrchestrator({
      createSandbox: async (sandbox) => {
        created.push(sandbox.chatId)
      },
    })

    await runAgentRequest({
      config: createTestConfig(),
      orchestrator,
      registry,
      request: {
        chatId: 'chat-id',
        files: [],
        prompt: 'hello again',
        version: 1,
      },
    })

    expect(created).toEqual([])
  })
})

function createOrchestrator(
  overrides: Partial<SbxOrchestrator> = {},
): SbxOrchestrator {
  return {
    createSandbox: async () => {},
    disposeSandbox: async () => {},
    runAgent: async () => agentResponse,
    ...overrides,
  }
}
