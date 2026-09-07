export type Config = ReturnType<typeof createConfigFromEnv>

export type ConfigEnvironment = Record<string, string | undefined>

const ALLOWED_CLIENT_ORIGIN_PROTOCOLS = new Set(['http:', 'https:'])
const DEFAULT_CLIENT_ORIGIN = 'http://localhost:5173'
const DEFAULT_HOST = '127.0.0.1'
const INVALID_CLIENT_ORIGIN_VALUES = new Set(['*', 'null'])
const INVALID_SERVER_BASE_URL_VALUES = new Set(['*', 'null'])
const DEFAULT_OPENROUTER_CHAT_MODEL = 'z-ai/glm-5.2:nitro'
const DEFAULT_OPENROUTER_IMAGE_MODEL = 'bytedance-seed/seedream-4.5'
const DEFAULT_OPENROUTER_VISION_MODEL = 'bytedance-seed/seed-2.0-mini'
const DEFAULT_OPENROUTER_API_URL = 'https://openrouter.ai/api/v1'
const DEFAULT_FIRECRAWL_CREDIT_USD = 0.002

export function createConfigFromEnv(source: ConfigEnvironment) {
  return {
    // Input token budget enforced per agent step by the TokenLimiter input
    // processor (estimated via tokenx, oldest non-system messages trimmed
    // first). Sized below GLM-5.2's context window minus the 16_384 output
    // cap and tokenizer estimate error; 0 disables trimming entirely.
    agentContextTokenLimit: parseNonNegativeInteger(
      optionalEnv(source, 'AGENT_CONTEXT_TOKEN_LIMIT') ?? '180000',
      'AGENT_CONTEXT_TOKEN_LIMIT',
    ),
    agentGeneration: {
      // GLM-5.2 sampling — Z.ai recommends tuning EITHER temperature OR
      // top_p (never both). Default temperature 1.0; set AGENT_TOP_P to
      // switch to nucleus sampling instead (route.ts emits only one).
      // Optional OpenRouter reasoning control forwarded verbatim as
      // `reasoning: { effort }` in the request body (providerOptions.openrouter
      // spreads into the wire args). Unset = provider default (GLM-5.2 keeps
      // its recommended deep reasoning). Set 'low' for over-thinking models
      // (e.g. qwen 27b) whose reasoning otherwise eats the maxOutputTokens
      // budget and truncates the response before any tool call.
      reasoningEffort: parseOptionalEnum(
        optionalEnv(source, 'AGENT_REASONING_EFFORT'),
        ['low', 'medium', 'high', 'none'],
        'AGENT_REASONING_EFFORT',
      ),
      // Hard cap on reasoning tokens (`reasoning: { max_tokens }`). More
      // reliable than effort for models whose providers ignore effort in
      // tool-heavy agentic contexts (qwen 27b reasons unbounded until the
      // maxOutputTokens budget is gone and the step truncates).
      reasoningMaxTokens: parseOptionalNonNegativeNumber(
        optionalEnv(source, 'AGENT_REASONING_MAX_TOKENS'),
        'AGENT_REASONING_MAX_TOKENS',
      ),
      temperature: parseNonNegativeNumber(
        optionalEnv(source, 'AGENT_TEMPERATURE') ?? '1',
        'AGENT_TEMPERATURE',
      ),
      topP: parseOptionalNonNegativeNumber(
        optionalEnv(source, 'AGENT_TOP_P'),
        'AGENT_TOP_P',
      ),
    },
    agentMaxCostUsd: parseNonNegativeNumber(
      optionalEnv(source, 'AGENT_MAX_COST_USD') ?? '5',
      'AGENT_MAX_COST_USD',
    ),
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
    clientOrigin: parseClientOrigin(
      optionalEnv(source, 'CLIENT_ORIGIN') ?? DEFAULT_CLIENT_ORIGIN,
    ),
    firecrawl: {
      apiKey: optionalEnv(source, 'FIRECRAWL_API_KEY'),
      apiUrl: optionalEnv(source, 'FIRECRAWL_API_URL'),
      creditUsd: parseNonNegativeNumber(
        optionalEnv(source, 'FIRECRAWL_CREDIT_USD') ??
          String(DEFAULT_FIRECRAWL_CREDIT_USD),
        'FIRECRAWL_CREDIT_USD',
      ),
    },
    host: optionalEnv(source, 'HOST') ?? DEFAULT_HOST,
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
    providerExecution: {
      drainGraceMs: parseNonNegativeInteger(
        optionalEnv(source, 'PROVIDER_DRAIN_GRACE_MS') ?? '5000',
        'PROVIDER_DRAIN_GRACE_MS',
      ),
      metadataTimeoutMs: parsePositiveInteger(
        optionalEnv(source, 'PROVIDER_METADATA_TIMEOUT_MS') ?? '10000',
        'PROVIDER_METADATA_TIMEOUT_MS',
      ),
      operationTimeoutMs: parsePositiveInteger(
        optionalEnv(source, 'PROVIDER_OPERATION_TIMEOUT_MS') ?? '120000',
        'PROVIDER_OPERATION_TIMEOUT_MS',
      ),
    },
    serverBaseUrl: parseServerBaseUrl(
      optionalEnv(source, 'SERVER_BASE_URL') ??
        `http://${optionalEnv(source, 'HOST') ?? DEFAULT_HOST}:${parsePort(optionalEnv(source, 'PORT') ?? '3001')}`,
    ),
  } as const
}

function optionalEnv(source: ConfigEnvironment, name: string) {
  const value = source[name]?.trim()

  return value ? value : undefined
}

function parseClientOrigin(value: string) {
  if (INVALID_CLIENT_ORIGIN_VALUES.has(value) || value.includes(',')) {
    throw new Error('Invalid CLIENT_ORIGIN value')
  }
  if (!URL.canParse(value)) {
    throw new Error('Invalid CLIENT_ORIGIN value')
  }

  const url = new URL(value)
  const hasUnsupportedParts = [
    url.username,
    url.password,
    url.pathname === '/' ? '' : url.pathname,
    url.search,
    url.hash,
  ].some(Boolean)

  if (
    !ALLOWED_CLIENT_ORIGIN_PROTOCOLS.has(url.protocol) ||
    hasUnsupportedParts
  ) {
    throw new Error('Invalid CLIENT_ORIGIN value')
  }

  return url.origin
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

function parseOptionalEnum<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  name: string,
): T | undefined {
  if (!value) {
    return undefined
  }
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(
      `Invalid ${name} value: ${value} (allowed: ${allowed.join(', ')})`,
    )
  }
  return value as T
}

function parseOptionalNonNegativeNumber(
  value: string | undefined,
  name: string,
) {
  if (!value) {
    return undefined
  }

  return parseNonNegativeNumber(value, name)
}

function parsePort(value: string) {
  const port = Number(value)

  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`Invalid PORT value: ${value}`)
  }

  return port
}

function parsePositiveInteger(value: string, name: string) {
  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name} value: ${value}`)
  }

  return parsed
}

function parseServerBaseUrl(value: string) {
  if (INVALID_SERVER_BASE_URL_VALUES.has(value) || value.includes(',')) {
    throw new Error('Invalid SERVER_BASE_URL value')
  }
  if (!URL.canParse(value)) {
    throw new Error('Invalid SERVER_BASE_URL value')
  }

  const url = new URL(value)
  if (!ALLOWED_CLIENT_ORIGIN_PROTOCOLS.has(url.protocol)) {
    throw new Error('Invalid SERVER_BASE_URL value')
  }
  const hasUnsupportedParts = [
    url.username,
    url.password,
    url.pathname === '/' ? '' : url.pathname,
    url.search,
    url.hash,
  ].some(Boolean)

  if (hasUnsupportedParts) {
    throw new Error('Invalid SERVER_BASE_URL value')
  }

  return url.origin
}
