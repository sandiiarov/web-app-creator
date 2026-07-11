import { describe, expect, it } from 'vitest'

type OpenRouterModel = {
  doStream: (options: Record<string, unknown>) => Promise<{
    stream: ReadableStream<StreamPart>
  }>
}

type OpenRouterModule = {
  createOpenRouter: (options: { apiKey: string; fetch: typeof fetch }) => {
    chat: (modelId: string) => OpenRouterModel
  }
}

type StreamPart = {
  input?: string
  toolCallId?: string
  toolName?: string
  type: string
}

const ADAPTERS = [
  { chunk: 'chunk-GHDHOLZS.js', name: 'ESM' },
  { chunk: 'chunk-YYUDVZJC.cjs', name: 'CommonJS' },
] as const

const EDIT_INPUT = JSON.stringify({
  action: 'Replace the heading',
  diff: '[index.html#ABCD]\nSWAP 1.=1:\n+<h1>Done</h1>',
})

const streamChunk = (
  delta: Record<string, unknown>,
  finishReason: null | string = null,
) => ({
  choices: [
    {
      delta,
      finish_reason: finishReason,
      index: 0,
    },
  ],
  id: 'response-1',
  model: 'z-ai/glm-5.2',
  provider: 'test',
})

const createEventStreamResponse = (chunks: unknown[]) =>
  new Response(
    `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`,
    {
      headers: { 'content-type': 'text/event-stream' },
      status: 200,
    },
  )

const loadOpenRouterModule = async (chunk: string) => {
  const coreEntry = import.meta.resolve('@mastra/core')
  const moduleUrl = new URL(chunk, coreEntry)

  return (await import(/* @vite-ignore */ moduleUrl.href)) as OpenRouterModule
}

const streamModel = async (chunk: string, chunks: unknown[]) => {
  const { createOpenRouter } = await loadOpenRouterModule(chunk)
  const model = createOpenRouter({
    apiKey: 'test-key',
    fetch: async () => createEventStreamResponse(chunks),
  }).chat('z-ai/glm-5.2')

  return model.doStream({
    includeRawChunks: true,
    prompt: [
      {
        content: [{ text: 'Edit the page.', type: 'text' }],
        role: 'user',
      },
    ],
    toolChoice: { toolName: 'edit', type: 'tool' },
    tools: [
      {
        description: 'Edit the page.',
        inputSchema: {
          additionalProperties: false,
          properties: {
            action: { type: 'string' },
            diff: { type: 'string' },
          },
          required: ['action', 'diff'],
          type: 'object',
        },
        name: 'edit',
        type: 'function',
      },
    ],
  })
}

const collectStream = async (stream: ReadableStream<StreamPart>) => {
  const parts: StreamPart[] = []

  for await (const part of stream) parts.push(part)

  return parts
}

describe.each(ADAPTERS)(
  'patched Mastra OpenRouter $name tool streaming',
  ({ chunk }) => {
    it('replaces an empty placeholder and emits the complete arguments once', async () => {
      const { stream } = await streamModel(chunk, [
        streamChunk({
          role: 'assistant',
          tool_calls: [
            {
              function: { arguments: '{}', name: 'edit' },
              id: 'call-edit',
              index: 0,
              type: 'function',
            },
          ],
        }),
        streamChunk({
          tool_calls: [
            {
              function: { arguments: EDIT_INPUT },
              index: 0,
            },
          ],
        }),
        streamChunk({ content: '' }),
        streamChunk({}, 'tool_calls'),
      ])
      const parts = await collectStream(stream)
      const toolCalls = parts.filter((part) => part.type === 'tool-call')

      expect(toolCalls).toEqual([
        expect.objectContaining({
          input: EDIT_INPUT,
          toolCallId: 'call-edit',
          toolName: 'edit',
        }),
      ])
    })

    it('joins ordinary argument deltas before emitting the tool call', async () => {
      const splitAt = EDIT_INPUT.indexOf('"diff"')
      const { stream } = await streamModel(chunk, [
        streamChunk({
          role: 'assistant',
          tool_calls: [
            {
              function: {
                arguments: EDIT_INPUT.slice(0, splitAt),
                name: 'edit',
              },
              id: 'call-edit',
              index: 0,
              type: 'function',
            },
          ],
        }),
        streamChunk({
          tool_calls: [
            {
              function: { arguments: EDIT_INPUT.slice(splitAt) },
              index: 0,
            },
          ],
        }),
        streamChunk({}, 'tool_calls'),
      ])
      const parts = await collectStream(stream)

      expect(parts.filter((part) => part.type === 'tool-call')).toEqual([
        expect.objectContaining({ input: EDIT_INPUT }),
      ])
    })

    it('errors instead of coercing incomplete arguments to an empty object', async () => {
      const { stream } = await streamModel(chunk, [
        streamChunk({
          role: 'assistant',
          tool_calls: [
            {
              function: { arguments: '{"action":', name: 'edit' },
              id: 'call-edit',
              index: 0,
              type: 'function',
            },
          ],
        }),
        streamChunk({}, 'tool_calls'),
      ])

      await expect(collectStream(stream)).rejects.toThrow(
        'incomplete tool-call arguments',
      )
    })
  },
)
