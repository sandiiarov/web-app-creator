import { describe, expect, it } from 'vitest'

import { createConfigFromEnv, type ConfigEnvironment } from './config-env.ts'

describe('createConfigFromEnv', () => {
  it('parses required explicit server environment', () => {
    expect(createConfigFromEnv(createEnv())).toEqual({
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
    })
  })

  it('rejects invalid numeric values', () => {
    expect(() =>
      createConfigFromEnv({
        ...createEnv(),
        PORT: '70000',
      }),
    ).toThrow('Invalid PORT value: 70000')

    expect(() =>
      createConfigFromEnv({
        ...createEnv(),
        SANDBOX_COMMAND_TIMEOUT_SECONDS: '0',
      }),
    ).toThrow('Invalid SANDBOX_COMMAND_TIMEOUT_SECONDS value: 0')
  })

  it('rejects missing required values', () => {
    expect(() =>
      createConfigFromEnv({
        ...createEnv(),
        MODEL_GATEWAY_BASE_URL: '',
      }),
    ).toThrow('Missing required environment variable: MODEL_GATEWAY_BASE_URL')
  })
})

function createEnv(): ConfigEnvironment {
  return {
    AI_MODEL: 'openrouter/test-model',
    APP_NAME: 'Web App Creator Test',
    APP_URL: 'http://localhost:5173',
    CLIENT_ORIGIN: 'http://localhost:5173',
    HOST: '127.0.0.1',
    MODEL_GATEWAY_BASE_URL:
      'http://host.docker.internal:3001/internal/model-gateway/v1',
    OPENROUTER_API_KEY: 'test-openrouter-key',
    PORT: '3001',
    SANDBOX_AGENT: 'shell',
    SANDBOX_COMMAND_TIMEOUT_SECONDS: '120',
    SANDBOX_CPUS: '1',
    SANDBOX_CREATE_TIMEOUT_SECONDS: '180',
    SANDBOX_IDLE_TTL_SECONDS: '900',
    SANDBOX_MEMORY: '2g',
    SANDBOX_TEMPLATE: 'web-app-creator-sandbox:dev',
    SANDBOX_WORKSPACE_ROOT: '/tmp/web-app-creator-sandboxes',
  }
}
