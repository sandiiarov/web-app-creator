import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { parsePositiveInteger, type Config } from './config-env.ts'
import { createChatSandboxRegistry } from './sandbox-chat-registry.ts'
import { createSbxOrchestrator } from './sbx-orchestrator.ts'

const describeSbx = isSbxIntegrationEnabled() ? describe : describe.skip

describeSbx('createSbxOrchestrator sbx integration', () => {
  it('creates and disposes a real Docker Sandbox', async () => {
    const workspaceRoot = await mkdtemp(
      path.join(tmpdir(), 'web-app-creator-sbx-integration-'),
    )
    const registry = createChatSandboxRegistry({
      idFactory: () => `integration-${Date.now()}`,
    })
    const orchestrator = createSbxOrchestrator(
      createIntegrationConfig(workspaceRoot),
    )
    const sandbox = registry.create(path.join(workspaceRoot, 'workspace'))

    try {
      await orchestrator.createSandbox(sandbox)
      registry.markStatus(sandbox.chatId, 'ready')

      expect(registry.find(sandbox.chatId)?.status).toBe('ready')
    } finally {
      await orchestrator.disposeSandbox(sandbox)
      await rm(workspaceRoot, { force: true, recursive: true })
    }
  }, 180_000)
})

function createIntegrationConfig(workspaceRoot: string): Config {
  return {
    ai: {
      key: 'not-used-by-this-test',
      model: 'not-used-by-this-test',
    },
    app: {
      name: 'Web App Creator Test',
      url: 'http://localhost:5173',
    },
    clientOrigin: 'http://localhost:5173',
    host: '127.0.0.1',
    modelGateway: {
      baseUrl: 'http://host.docker.internal:3001/internal/model-gateway/v1',
    },
    port: 3001,
    sandbox: {
      agent: requiredTestEnv('WEB_APP_CREATOR_TEST_SBX_AGENT'),
      commandTimeoutSeconds: parsePositiveInteger(
        requiredTestEnv('WEB_APP_CREATOR_TEST_SBX_COMMAND_TIMEOUT_SECONDS'),
        'WEB_APP_CREATOR_TEST_SBX_COMMAND_TIMEOUT_SECONDS',
      ),
      cpus: requiredTestEnv('WEB_APP_CREATOR_TEST_SBX_CPUS'),
      createTimeoutSeconds: parsePositiveInteger(
        requiredTestEnv('WEB_APP_CREATOR_TEST_SBX_CREATE_TIMEOUT_SECONDS'),
        'WEB_APP_CREATOR_TEST_SBX_CREATE_TIMEOUT_SECONDS',
      ),
      idleTtlSeconds: 900,
      memory: requiredTestEnv('WEB_APP_CREATOR_TEST_SBX_MEMORY'),
      template: requiredTestEnv('WEB_APP_CREATOR_TEST_SBX_TEMPLATE'),
      workspaceRoot,
    },
  }
}

function isSbxIntegrationEnabled() {
  return process.env.WEB_APP_CREATOR_ENABLE_SBX_INTEGRATION === '1'
}

function requiredTestEnv(name: string) {
  const value = process.env[name]

  if (!value?.trim()) {
    throw new Error(
      `Missing required test environment variable for sbx integration: ${name}`,
    )
  }

  return value
}
