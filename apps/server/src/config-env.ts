export type Config = ReturnType<typeof createConfigFromEnv>

export type ConfigEnvironment = Record<string, string | undefined>

export function createConfigFromEnv(source: ConfigEnvironment) {
  return {
    ai: {
      key: requiredEnv(source, 'OPENROUTER_API_KEY'),
      model: requiredEnv(source, 'AI_MODEL'),
    },
    app: {
      name: requiredEnv(source, 'APP_NAME'),
      url: requiredEnv(source, 'APP_URL'),
    },
    clientOrigin: requiredEnv(source, 'CLIENT_ORIGIN'),
    host: requiredEnv(source, 'HOST'),
    modelGateway: {
      baseUrl: requiredEnv(source, 'MODEL_GATEWAY_BASE_URL'),
    },
    port: parsePort(requiredEnv(source, 'PORT')),
    sandbox: {
      agent: requiredEnv(source, 'SANDBOX_AGENT'),
      commandTimeoutSeconds: parsePositiveInteger(
        requiredEnv(source, 'SANDBOX_COMMAND_TIMEOUT_SECONDS'),
        'SANDBOX_COMMAND_TIMEOUT_SECONDS',
      ),
      cpus: parsePositiveDecimalString(
        requiredEnv(source, 'SANDBOX_CPUS'),
        'SANDBOX_CPUS',
      ),
      createTimeoutSeconds: parsePositiveInteger(
        requiredEnv(source, 'SANDBOX_CREATE_TIMEOUT_SECONDS'),
        'SANDBOX_CREATE_TIMEOUT_SECONDS',
      ),
      idleTtlSeconds: parsePositiveInteger(
        requiredEnv(source, 'SANDBOX_IDLE_TTL_SECONDS'),
        'SANDBOX_IDLE_TTL_SECONDS',
      ),
      memory: requiredEnv(source, 'SANDBOX_MEMORY'),
      template: requiredEnv(source, 'SANDBOX_TEMPLATE'),
      workspaceRoot: requiredEnv(source, 'SANDBOX_WORKSPACE_ROOT'),
    },
  } as const
}

export function parsePositiveInteger(value: string, name: string) {
  const parsedValue = Number(value)

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`Invalid ${name} value: ${value}`)
  }

  return parsedValue
}

function parsePort(value: string) {
  const port = Number(value)

  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`Invalid PORT value: ${value}`)
  }

  return port
}

function parsePositiveDecimalString(value: string, name: string) {
  const parsedValue = Number(value)

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    throw new Error(`Invalid ${name} value: ${value}`)
  }

  return value
}

function requiredEnv(source: ConfigEnvironment, name: string) {
  const value = source[name]

  if (!value?.trim()) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}
