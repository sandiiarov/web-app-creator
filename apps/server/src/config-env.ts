export type Config = ReturnType<typeof createConfigFromEnv>

export type ConfigEnvironment = Record<string, string | undefined>

const DEFAULT_OPENROUTER_CHAT_MODEL = 'z-ai/glm-5.2'
const DEFAULT_OPENROUTER_IMAGE_MODEL = 'bytedance-seed/seedream-4.5'
const DEFAULT_OPENROUTER_VISION_MODEL = 'z-ai/glm-5v-turbo'
const DEFAULT_OPENROUTER_API_URL = 'https://openrouter.ai/api/v1'
const DEFAULT_FIRECRAWL_CREDIT_USD = 0.002

export function createConfigFromEnv(source: ConfigEnvironment) {
  return {
    agentMaxCostUsd: parseOptionalNonNegativeNumber(source, 'AGENT_MAX_COST_USD'),
    agentRetry: {
      modelMaxRetries: parseNonNegativeInteger(
        optionalEnv(source, 'AGENT_MODEL_MAX_RETRIES') ?? '0',
        'AGENT_MODEL_MAX_RETRIES',
      ),
      retryBaseDelayMs: parseNonNegativeInteger(
        optionalEnv(source, 'AGENT_RETRY_BASE_DELAY_MS') ?? '1000',
        'AGENT_RETRY_BASE_DELAY_MS',
      ),
      retryMaxDelayMs: parseNonNegativeInteger(
        optionalEnv(source, 'AGENT_RETRY_MAX_DELAY_MS') ?? '10000',
        'AGENT_RETRY_MAX_DELAY_MS',
      ),
      streamErrorMaxRetries: parseNonNegativeInteger(
        optionalEnv(source, 'AGENT_STREAM_ERROR_MAX_RETRIES') ?? '10',
        'AGENT_STREAM_ERROR_MAX_RETRIES',
      ),
    },
    clientOrigin: optionalEnv(source, 'CLIENT_ORIGIN') ?? '*',
    firecrawl: {
      apiKey: optionalEnv(source, 'FIRECRAWL_API_KEY'),
      creditUsd: parseNonNegativeNumber(
        optionalEnv(source, 'FIRECRAWL_CREDIT_USD') ??
          String(DEFAULT_FIRECRAWL_CREDIT_USD),
        'FIRECRAWL_CREDIT_USD',
      ),
    },
    host: optionalEnv(source, 'HOST') ?? '0.0.0.0',
    mastra: {
      platformAccessToken: optionalEnv(source, 'MASTRA_PLATFORM_ACCESS_TOKEN'),
      projectId: optionalEnv(source, 'MASTRA_PROJECT_ID'),
    },
    openrouter: {
      apiKey: optionalEnv(source, 'OPENROUTER_API_KEY'),
      chatApiUrl:
        optionalEnv(source, 'OPENROUTER_API_URL') ?? DEFAULT_OPENROUTER_API_URL,
      defaultChatModel:
        optionalEnv(source, 'OPENROUTER_CHAT_MODEL') ??
        DEFAULT_OPENROUTER_CHAT_MODEL,
      defaultImageModel:
        optionalEnv(source, 'OPENROUTER_IMAGE_MODEL') ??
        DEFAULT_OPENROUTER_IMAGE_MODEL,
      defaultVisionModel:
        optionalEnv(source, 'OPENROUTER_VISION_MODEL') ??
        DEFAULT_OPENROUTER_VISION_MODEL,
      imageApiUrl: 'https://openrouter.ai/api/v1/images',
    },
    port: parsePort(optionalEnv(source, 'PORT') ?? '3001'),
  } as const
}

function optionalEnv(source: ConfigEnvironment, name: string) {
  const value = source[name]?.trim()

  return value ? value : undefined
}

function parseNonNegativeInteger(value: string, name: string) {
  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid ${name} value: ${value}`)
  }

  return parsed
}

function parseNonNegativeNumber(value: string, name: string) {
  const parsed = Number(value)

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid ${name} value: ${value}`)
  }

  return parsed
}

function parseOptionalNonNegativeNumber(
  source: ConfigEnvironment,
  name: string,
): number | undefined {
  const value = optionalEnv(source, name)
  return value ? parseNonNegativeNumber(value, name) : undefined
}

function parsePort(value: string) {
  const port = Number(value)

  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`Invalid PORT value: ${value}`)
  }

  return port
}
