import { describe, expect, it } from 'vitest'

import { createConfigFromEnv, type ConfigEnvironment } from './config-env.ts'

function createEnv(overrides: ConfigEnvironment = {}): ConfigEnvironment {
  return { OPENROUTER_API_KEY: 'test-openrouter-key', ...overrides }
}

describe('createConfigFromEnv', () => {
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

  it('leaves Cloudflare capture credentials unset when env is absent', () => {
    expect(createConfigFromEnv(createEnv()).cloudflare).toEqual({
      accountId: undefined,
      apiToken: undefined,
    })
  })

  it('parses non-empty Cloudflare Browser Run credentials', () => {
    expect(
      createConfigFromEnv(
        createEnv({
          CLOUDFLARE_ACCOUNT_ID: 'account-id',
          CLOUDFLARE_API_TOKEN: 'browser-rendering-token',
        }),
      ).cloudflare,
    ).toEqual({
      accountId: 'account-id',
      apiToken: 'browser-rendering-token',
    })
  })

  it('treats whitespace-only Cloudflare credentials as absent', () => {
    expect(
      createConfigFromEnv(
        createEnv({
          CLOUDFLARE_ACCOUNT_ID: '  ',
          CLOUDFLARE_API_TOKEN: '\t',
        }),
      ).cloudflare,
    ).toEqual({
      accountId: undefined,
      apiToken: undefined,
    })
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

  it('defaults the per-run cost cap to $1 and allows override/disable', () => {
    expect(createConfigFromEnv(createEnv()).agentMaxCostUsd).toBe(1)
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
