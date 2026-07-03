import { describe, expect, it } from 'vitest'

import { createConfigFromEnv, type ConfigEnvironment } from './config-env.ts'

function createEnv(overrides: ConfigEnvironment = {}): ConfigEnvironment {
  return { BASETEN_API_KEY: 'test-baseten-key', ...overrides }
}

describe('createConfigFromEnv', () => {
  it('parses baseten config with defaults', () => {
    const config = createConfigFromEnv(createEnv())

    expect(config.baseten).toEqual({
      apiKey: 'test-baseten-key',
      defaultModel: 'zai-org/GLM-5.2',
      url: 'https://inference.baseten.co/v1',
    })
  })

  it('applies server binding defaults', () => {
    const config = createConfigFromEnv(createEnv())

    expect(config.host).toBe('0.0.0.0')
    expect(config.port).toBe(3001)
    expect(config.clientOrigin).toBe('*')
  })

  it('parses agent retry defaults', () => {
    const config = createConfigFromEnv(createEnv())

    expect(config.agentRetry).toEqual({
      modelMaxRetries: 0,
      retryBaseDelayMs: 1000,
      retryMaxDelayMs: 10000,
      streamErrorMaxRetries: 2,
    })
  })

  it('leaves mastra observability unset when env is absent', () => {
    const config = createConfigFromEnv(createEnv())

    expect(config.mastra.platformAccessToken).toBeUndefined()
    expect(config.mastra.projectId).toBeUndefined()
  })

  it('overrides baseten model + binding from env', () => {
    const config = createConfigFromEnv(
      createEnv({
        BASETEN_MODEL: 'moonshotai/Kimi-K2.7-Code',
        CLIENT_ORIGIN: 'http://localhost:5173',
        HOST: '127.0.0.1',
        PORT: '4000',
      }),
    )

    expect(config.baseten.defaultModel).toBe('moonshotai/Kimi-K2.7-Code')
    expect(config.clientOrigin).toBe('http://localhost:5173')
    expect(config.host).toBe('127.0.0.1')
    expect(config.port).toBe(4000)
  })

  it('overrides agent retry settings from env', () => {
    const config = createConfigFromEnv(
      createEnv({
        AGENT_MODEL_MAX_RETRIES: '1',
        AGENT_RETRY_BASE_DELAY_MS: '250',
        AGENT_RETRY_MAX_DELAY_MS: '2000',
        AGENT_STREAM_ERROR_MAX_RETRIES: '3',
      }),
    )

    expect(config.agentRetry).toEqual({
      modelMaxRetries: 1,
      retryBaseDelayMs: 250,
      retryMaxDelayMs: 2000,
      streamErrorMaxRetries: 3,
    })
  })

  it('reads mastra observability credentials when present', () => {
    const config = createConfigFromEnv(
      createEnv({
        MASTRA_PLATFORM_ACCESS_TOKEN: 'platform-token',
        MASTRA_PROJECT_ID: 'project-id',
      }),
    )

    expect(config.mastra.platformAccessToken).toBe('platform-token')
    expect(config.mastra.projectId).toBe('project-id')
  })

  it('requires BASETEN_API_KEY', () => {
    expect(() => createConfigFromEnv({})).toThrow('BASETEN_API_KEY')
  })

  it('rejects an invalid port', () => {
    expect(() => createConfigFromEnv(createEnv({ PORT: 'nope' }))).toThrow(
      'Invalid PORT',
    )
  })

  it('rejects invalid retry values', () => {
    expect(() =>
      createConfigFromEnv(createEnv({ AGENT_MODEL_MAX_RETRIES: '-1' })),
    ).toThrow('Invalid AGENT_MODEL_MAX_RETRIES')
  })
})
