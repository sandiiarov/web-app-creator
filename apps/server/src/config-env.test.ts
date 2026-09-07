import { describe, expect, it } from 'vitest'

import { createConfigFromEnv, type ConfigEnvironment } from './config-env.ts'

function createEnv(overrides: ConfigEnvironment = {}): ConfigEnvironment {
  return { OPENROUTER_API_KEY: 'test-openrouter-key', ...overrides }
}

describe('createConfigFromEnv', () => {
  it('derives serverBaseUrl from HOST/PORT by default', () => {
    expect(createConfigFromEnv(createEnv()).serverBaseUrl).toBe(
      'http://127.0.0.1:3001',
    )
    expect(
      createConfigFromEnv(createEnv({ HOST: '0.0.0.0', PORT: '4000' }))
        .serverBaseUrl,
    ).toBe('http://0.0.0.0:4000')
  })

  it('honors an explicit SERVER_BASE_URL and normalizes trailing slash', () => {
    expect(
      createConfigFromEnv(
        createEnv({ SERVER_BASE_URL: 'https://example.com/' }),
      ).serverBaseUrl,
    ).toBe('https://example.com')
  })

  it('rejects invalid SERVER_BASE_URL values', () => {
    for (const value of ['*', 'null', 'ftp://x', 'https://x/path']) {
      expect(() =>
        createConfigFromEnv(createEnv({ SERVER_BASE_URL: value })),
      ).toThrow('Invalid SERVER_BASE_URL value')
    }
  })

  it('defaults the agent context token limit and honors overrides', () => {
    expect(createConfigFromEnv(createEnv()).agentContextTokenLimit).toBe(
      180_000,
    )
    expect(
      createConfigFromEnv(createEnv({ AGENT_CONTEXT_TOKEN_LIMIT: '240000' }))
        .agentContextTokenLimit,
    ).toBe(240_000)
    expect(
      createConfigFromEnv(createEnv({ AGENT_CONTEXT_TOKEN_LIMIT: '0' }))
        .agentContextTokenLimit,
    ).toBe(0)
    expect(() =>
      createConfigFromEnv(createEnv({ AGENT_CONTEXT_TOKEN_LIMIT: '-1' })),
    ).toThrow('Invalid AGENT_CONTEXT_TOKEN_LIMIT value')
  })

  it('parses openrouter config with defaults', () => {
    const config = createConfigFromEnv(createEnv())

    expect(config.openrouter).toEqual({
      apiKey: 'test-openrouter-key',
      chatApiUrl: 'https://openrouter.ai/api/v1',
      defaultChatModel: 'z-ai/glm-5.2:nitro',
      defaultImageModel: 'bytedance-seed/seedream-4.5',
      defaultVisionModel: 'bytedance-seed/seed-2.0-mini',
      imageApiUrl: 'https://openrouter.ai/api/v1/images',
    })
  })

  it('leaves the Firecrawl key unset when env is absent', () => {
    expect(createConfigFromEnv(createEnv()).firecrawl).toEqual({
      apiKey: undefined,
      apiUrl: undefined,
      creditUsd: 0.002,
    })
  })

  it('parses a non-empty Firecrawl API key and trims whitespace-only values', () => {
    expect(
      createConfigFromEnv(createEnv({ FIRECRAWL_API_KEY: 'fc-test' })).firecrawl
        .apiKey,
    ).toBe('fc-test')
    expect(
      createConfigFromEnv(createEnv({ FIRECRAWL_API_KEY: '  ' })).firecrawl
        .apiKey,
    ).toBeUndefined()
  })

  it('applies server binding and Firecrawl cost defaults', () => {
    const config = createConfigFromEnv(createEnv())

    expect(config.host).toBe('127.0.0.1')
    expect(config.port).toBe(3001)
    expect(config.clientOrigin).toBe('http://localhost:5173')
    expect(config.firecrawl.creditUsd).toBe(0.002)
  })

  it.each([
    ['http://localhost:5173', 'http://localhost:5173'],
    ['http://localhost:5173/', 'http://localhost:5173'],
    ['https://CLIENT.test:443/', 'https://client.test'],
  ])('normalizes a safe CLIENT_ORIGIN %s', (value, expected) => {
    expect(
      createConfigFromEnv(createEnv({ CLIENT_ORIGIN: value })).clientOrigin,
    ).toBe(expected)
  })

  it.each([
    '*',
    'null',
    'ftp://client.test',
    'https://user:password@client.test',
    'https://client.test/app',
    'https://client.test?mode=app',
    'https://client.test#app',
    'https://client.test,https://other.test',
  ])('rejects an unsafe CLIENT_ORIGIN', (value) => {
    expect(() =>
      createConfigFromEnv(
        createEnv({ CLIENT_ORIGIN: value, OPENROUTER_API_KEY: 'unrelated' }),
      ),
    ).toThrow(/^Invalid CLIENT_ORIGIN value$/)
  })

  it('parses agent retry defaults', () => {
    const config = createConfigFromEnv(createEnv())

    expect(config.agentRetry).toEqual({
      modelMaxRetries: 0,
      retryBaseDelayMs: 1000,
      retryMaxDelayMs: 10000,
      streamErrorMaxRetries: 10,
    })
  })

  it('parses provider execution limits', () => {
    expect(createConfigFromEnv(createEnv()).providerExecution).toEqual({
      drainGraceMs: 5_000,
      metadataTimeoutMs: 10_000,
      operationTimeoutMs: 120_000,
    })
    expect(
      createConfigFromEnv(
        createEnv({
          PROVIDER_DRAIN_GRACE_MS: '50',
          PROVIDER_METADATA_TIMEOUT_MS: '75',
          PROVIDER_OPERATION_TIMEOUT_MS: '100',
        }),
      ).providerExecution,
    ).toEqual({
      drainGraceMs: 50,
      metadataTimeoutMs: 75,
      operationTimeoutMs: 100,
    })
    expect(() =>
      createConfigFromEnv(createEnv({ PROVIDER_OPERATION_TIMEOUT_MS: '0' })),
    ).toThrow('Invalid PROVIDER_OPERATION_TIMEOUT_MS value: 0')
    expect(() =>
      createConfigFromEnv(createEnv({ PROVIDER_METADATA_TIMEOUT_MS: '0' })),
    ).toThrow('Invalid PROVIDER_METADATA_TIMEOUT_MS value: 0')
  })

  it('defaults the per-run cost cap to $5 and allows override/disable', () => {
    expect(createConfigFromEnv(createEnv()).agentMaxCostUsd).toBe(5)
    expect(
      createConfigFromEnv(createEnv({ AGENT_MAX_COST_USD: '0.25' }))
        .agentMaxCostUsd,
    ).toBe(0.25)
    // `0` disables the cap (route.ts treats <= 0 as no cap).
    expect(
      createConfigFromEnv(createEnv({ AGENT_MAX_COST_USD: '0' }))
        .agentMaxCostUsd,
    ).toBe(0)
  })

  it('leaves mastra observability unset when env is absent', () => {
    const config = createConfigFromEnv(createEnv())

    expect(config.mastra.platformAccessToken).toBeUndefined()
    expect(config.mastra.projectId).toBeUndefined()
  })

  it('overrides openrouter models + binding from env', () => {
    const config = createConfigFromEnv(
      createEnv({
        CLIENT_ORIGIN: 'http://localhost:5173',
        FIRECRAWL_CREDIT_USD: '0.0015',
        HOST: '127.0.0.1',
        OPENROUTER_CHAT_MODEL: 'deepseek/deepseek-v4-pro',
        PORT: '4000',
      }),
    )

    expect(config.openrouter.defaultChatModel).toBe('deepseek/deepseek-v4-pro')
    expect(config.clientOrigin).toBe('http://localhost:5173')
    expect(config.host).toBe('127.0.0.1')
    expect(config.port).toBe(4000)
    expect(config.firecrawl.creditUsd).toBe(0.0015)
  })

  it('leaves openrouter api key unset when env is absent', () => {
    const config = createConfigFromEnv({})

    expect(config.openrouter.apiKey).toBeUndefined()
    expect(config.openrouter.defaultChatModel).toBe('z-ai/glm-5.2:nitro')
  })
})
