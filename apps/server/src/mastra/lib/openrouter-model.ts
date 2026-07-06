import type { OpenAICompatibleConfig } from '@mastra/core/llm'

import { config } from '../../config.ts'

/**
 * Build an OpenAI-compatible model config pointing at OpenRouter's chat
 * completions API. Mastra's built-in client POSTs OpenRouter directly — no
 * `@ai-sdk/openrouter`, no Mastra model router, no provider package.
 *
 * `id` must be `openrouter/${modelId}` so Mastra's OpenAI-compatible client
 * strips the synthetic `openrouter/` prefix and sends the full model id
 * (e.g. `z-ai/glm-5.2`) verbatim to `openrouter.ai/api/v1/chat/completions`.
 */
export function openrouterModel(
  modelId: string = config.openrouter.defaultChatModel,
): OpenAICompatibleConfig {
  return {
    apiKey: config.openrouter.apiKey,
    headers: { 'X-OpenRouter-Metadata': 'enabled' },
    id: `openrouter/${modelId}`,
    url: config.openrouter.chatApiUrl,
  }
}
