export type Config = ReturnType<typeof createConfigFromEnv>

export type ConfigEnvironment = Record<string, string | undefined>

const DEFAULT_BASETEN_MODEL_ID = 'zai-org/GLM-5.2'
const DEFAULT_BASETEN_API_URL = 'https://inference.baseten.co/v1'

export function createConfigFromEnv(source: ConfigEnvironment) {
  return {
    baseten: {
      apiKey: requiredEnv(source, 'BASETEN_API_KEY'),
      defaultModel:
        optionalEnv(source, 'BASETEN_MODEL') ?? DEFAULT_BASETEN_MODEL_ID,
      url: optionalEnv(source, 'BASETEN_API_URL') ?? DEFAULT_BASETEN_API_URL,
    },
    clientOrigin: optionalEnv(source, 'CLIENT_ORIGIN') ?? '*',
    firecrawl: {
      apiKey: optionalEnv(source, 'FIRECRAWL_API_KEY'),
    },
    host: optionalEnv(source, 'HOST') ?? '0.0.0.0',
    mastra: {
      platformAccessToken: optionalEnv(source, 'MASTRA_PLATFORM_ACCESS_TOKEN'),
      projectId: optionalEnv(source, 'MASTRA_PROJECT_ID'),
    },
    openrouter: {
      apiKey: optionalEnv(source, 'OPENROUTER_API_KEY'),
      imageApiUrl: 'https://openrouter.ai/api/v1/images',
    },
    port: parsePort(optionalEnv(source, 'PORT') ?? '3001'),
  } as const
}

export function parsePort(value: string) {
  const port = Number(value)

  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`Invalid PORT value: ${value}`)
  }

  return port
}

function optionalEnv(source: ConfigEnvironment, name: string) {
  const value = source[name]?.trim()

  return value ? value : undefined
}

function requiredEnv(source: ConfigEnvironment, name: string) {
  const value = source[name]

  if (!value?.trim()) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}
