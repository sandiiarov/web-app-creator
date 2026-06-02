export default function registerWebAppCreatorProvider(pi) {
  const baseUrl = requiredEnv('WEB_APP_CREATOR_MODEL_GATEWAY_BASE_URL')
  const modelId = requiredEnv('WEB_APP_CREATOR_MODEL_ID')

  pi.registerProvider('web-app-creator', {
    api: 'openai-completions',
    apiKey: 'WEB_APP_CREATOR_MODEL_GATEWAY_TOKEN',
    authHeader: true,
    baseUrl,
    models: [
      {
        contextWindow: 1_000_000,
        cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
        id: modelId,
        input: ['text'],
        maxTokens: 16_384,
        name: modelId,
        reasoning: true,
      },
    ],
    name: 'Web App Creator Gateway',
  })
}

function requiredEnv(name) {
  const value = process.env[name]

  if (!value?.trim()) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}
