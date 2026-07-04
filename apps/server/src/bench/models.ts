/**
 * Model candidates for the read/find/edit benchmark.
 *
 * Edit this list to compare the models you care about. Each candidate sends
 * `model` verbatim to OpenRouter's `/chat/completions` endpoint.
 *
 * A candidate only runs when `OPENROUTER_API_KEY` is present in the environment.
 * Use `pnpm --filter @workspace/server bench -- --model <label>` to run a
 * subset (comma-separated), or `--list` to print what would run.
 */

export type BenchProvider = 'openrouter'

export interface ModelCandidate {
  apiKeyEnv: string
  baseUrl: string
  /** Extra headers (e.g. OpenRouter rankings headers). */
  headers?: Record<string, string>
  /** Short label used in tables and filters. Keep it unique. */
  label: string
  /** Exact model id sent in the request body. */
  model: string
  provider: BenchProvider
}

const OPENROUTER_HEADERS: Record<string, string> = {
  'HTTP-Referer': 'https://github.com/web-app-creator',
  'X-Title': 'read-find-edit-bench',
}

export const MODEL_CANDIDATES: ModelCandidate[] = [
  {
    apiKeyEnv: 'OPENROUTER_API_KEY',
    baseUrl: 'https://openrouter.ai/api/v1',
    headers: OPENROUTER_HEADERS,
    label: 'glm-5.2',
    model: 'z-ai/glm-5.2',
    provider: 'openrouter',
  },
  {
    apiKeyEnv: 'OPENROUTER_API_KEY',
    baseUrl: 'https://openrouter.ai/api/v1',
    headers: OPENROUTER_HEADERS,
    label: 'kimi-k2.7-code',
    model: 'moonshotai/kimi-k2.7-code',
    provider: 'openrouter',
  },
  {
    apiKeyEnv: 'OPENROUTER_API_KEY',
    baseUrl: 'https://openrouter.ai/api/v1',
    headers: OPENROUTER_HEADERS,
    label: 'deepseek-v4-pro',
    model: 'deepseek/deepseek-v4-pro',
    provider: 'openrouter',
  },
  {
    apiKeyEnv: 'OPENROUTER_API_KEY',
    baseUrl: 'https://openrouter.ai/api/v1',
    headers: OPENROUTER_HEADERS,
    label: 'nemotron-ultra',
    model: 'nvidia/nemotron-3-ultra-550b-a55b',
    provider: 'openrouter',
  },
]

export interface ResolvedModel {
  apiKey: string
  baseUrl: string
  headers?: Record<string, string>
  label: string
  model: string
  provider: BenchProvider
}

/**
 * Return candidates whose API key is present. Models without a key are skipped
 * (and returned via `skipped` so the runner can report them).
 */
export function resolveModels(): {
  models: ResolvedModel[]
  skipped: string[]
} {
  const models: ResolvedModel[] = []
  const skipped: string[] = []
  for (const candidate of MODEL_CANDIDATES) {
    const apiKey = process.env[candidate.apiKeyEnv]?.trim()
    if (!apiKey) {
      skipped.push(`${candidate.label} (missing ${candidate.apiKeyEnv})`)
      continue
    }
    models.push({
      apiKey,
      baseUrl: candidate.baseUrl,
      headers: candidate.headers,
      label: candidate.label,
      model: candidate.model,
      provider: candidate.provider,
    })
  }
  return { models, skipped }
}
