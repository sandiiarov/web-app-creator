import type { OpenAICompatibleConfig } from '@mastra/core/llm'

import { config } from '../../config.ts'

/**
 * Build an OpenAI-compatible model config pointing at Baseten's raw inference
 * API. Mastra's built-in client POSTs Baseten directly — no `@ai-sdk/baseten`,
 * no Mastra model router, no provider package.
 *
 * `id` must be `${provider}/${model}` so Mastra's OpenAI-compatible client picks
 * the model id after the slash.
 */
export function basetenModel(
  modelId: string = config.baseten.defaultModel,
): OpenAICompatibleConfig {
  return {
    apiKey: config.baseten.apiKey,
    id: `baseten/${modelId}`,
    url: config.baseten.url,
  }
}
