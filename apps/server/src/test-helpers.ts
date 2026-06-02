import type { Config } from './config-env.ts'

export function createTestConfig(): Config {
  return {
    ai: {
      key: 'test-openrouter-key',
      model: 'openrouter/test-model',
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
      agent: 'shell',
      commandTimeoutSeconds: 120,
      cpus: '1',
      createTimeoutSeconds: 180,
      idleTtlSeconds: 900,
      memory: '2g',
      template: 'web-app-creator-sandbox:dev',
      workspaceRoot: '/tmp/web-app-creator-sandboxes',
    },
  }
}

export function createTestSandbox(workspacePath: string) {
  return {
    chatId: 'chat-id',
    createdAt: 1,
    gatewayToken: 'token',
    lastUsedAt: 1,
    sandboxName: 'sandbox-name',
    status: 'ready' as const,
    workspacePath,
  }
}
