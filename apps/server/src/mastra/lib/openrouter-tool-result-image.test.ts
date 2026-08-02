import { describe, expect, it } from 'vitest'

/**
 * Wire-level coverage for the patched OpenRouter adapters: multimodal
 * tool-result `content` outputs (text + media) must serialize as
 * chat-completions content parts (`text` + `image_url`), not a JSON string,
 * so screenshots returned by tools reach vision-capable chat models.
 */

type CapturedRequest = {
  messages?: Array<{
    content: unknown
    role: string
  }>
}

type OpenRouterModel = {
  doGenerate: (options: Record<string, unknown>) => Promise<unknown>
}

type OpenRouterModule = {
  createOpenRouter: (options: { apiKey: string; fetch: typeof fetch }) => {
    chat: (modelId: string) => OpenRouterModel
  }
}

const ADAPTERS = [
  { chunk: 'chunk-GHDHOLZS.js', name: 'ESM' },
  { chunk: 'chunk-YYUDVZJC.cjs', name: 'CommonJS' },
] as const

const generateResponse = () =>
  new Response(
    JSON.stringify({
      choices: [
        {
          finish_reason: 'stop',
          index: 0,
          message: { content: 'Looks good.', role: 'assistant' },
        },
      ],
      id: 'response-1',
      model: 'acme/vision-chat',
      provider: 'test',
      usage: { completion_tokens: 3, prompt_tokens: 10, total_tokens: 13 },
    }),
    { headers: { 'content-type': 'application/json' }, status: 200 },
  )

const loadOpenRouterModule = async (chunk: string) => {
  const coreEntry = import.meta.resolve('@mastra/core')
  const moduleUrl = new URL(chunk, coreEntry)

  return (await import(/* @vite-ignore */ moduleUrl.href)) as OpenRouterModule
}

describe('OpenRouter adapter multimodal tool-result serialization', () => {
  for (const adapter of ADAPTERS) {
    it(`serializes content tool results as text + image_url parts (${adapter.name})`, async () => {
      const bodies: CapturedRequest[] = []
      const { createOpenRouter } = await loadOpenRouterModule(adapter.chunk)
      const model = createOpenRouter({
        apiKey: 'test-key',
        fetch: async (_url, init) => {
          bodies.push(JSON.parse(String(init?.body ?? '{}')) as CapturedRequest)
          return generateResponse()
        },
      }).chat('acme/vision-chat')

      await model.doGenerate({
        prompt: [
          {
            content: [
              {
                input: { selector: 'main' },
                toolCallId: 'call-1',
                toolName: 'screenshot',
                type: 'tool-call',
              },
            ],
            role: 'assistant',
          },
          {
            content: [
              {
                output: {
                  type: 'content',
                  value: [
                    { text: 'Captured 3 viewports.', type: 'text' },
                    {
                      data: '/9j/4AAQ',
                      mediaType: 'image/jpeg',
                      type: 'media',
                    },
                  ],
                },
                toolCallId: 'call-1',
                toolName: 'screenshot',
                type: 'tool-result',
              },
            ],
            role: 'tool',
          },
        ],
      })

      const toolMessage = bodies[0]?.messages?.find(
        (message) => message.role === 'tool',
      )
      expect(toolMessage?.content).toEqual([
        { text: 'Captured 3 viewports.', type: 'text' },
        {
          image_url: { url: 'data:image/jpeg;base64,/9j/4AAQ' },
          type: 'image_url',
        },
      ])
    })

    it(`still serializes plain outputs as before (${adapter.name})`, async () => {
      const bodies: CapturedRequest[] = []
      const { createOpenRouter } = await loadOpenRouterModule(adapter.chunk)
      const model = createOpenRouter({
        apiKey: 'test-key',
        fetch: async (_url, init) => {
          bodies.push(JSON.parse(String(init?.body ?? '{}')) as CapturedRequest)
          return generateResponse()
        },
      }).chat('acme/vision-chat')

      await model.doGenerate({
        prompt: [
          {
            content: [
              {
                output: { type: 'text', value: 'plain result' },
                toolCallId: 'call-1',
                toolName: 'read',
                type: 'tool-result',
              },
            ],
            role: 'tool',
          },
        ],
      })

      const toolMessage = bodies[0]?.messages?.find(
        (message) => message.role === 'tool',
      )
      expect(toolMessage?.content).toBe('plain result')
    })
  }
})
