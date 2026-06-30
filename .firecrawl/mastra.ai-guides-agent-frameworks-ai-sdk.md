[Skip to main content](https://mastra.ai/guides/agent-frameworks/ai-sdk#__docusaurus_skipToContent_fallback)

Copy markdown

On this page

If you're already using the [Vercel AI SDK](https://sdk.vercel.ai/) directly and want to add Mastra capabilities like [processors](https://mastra.ai/docs/agents/processors) or [memory](https://mastra.ai/docs/memory/memory-processors) without switching to the full Mastra agent API, [`withMastra()`](https://mastra.ai/reference/ai-sdk/with-mastra) lets you wrap any AI SDK model with these features. This is useful when you want to keep your existing AI SDK code but add input/output processing, conversation persistence, or content filtering.

tip

If you want to use Mastra together with AI SDK UI (e.g. `useChat()`), visit the [AI SDK UI guide](https://mastra.ai/guides/build-your-ui/ai-sdk-ui).

## Installation [Direct link to Installation](https://mastra.ai/guides/agent-frameworks/ai-sdk\#installation "Direct link to Installation")

Install `@mastra/ai-sdk` to begin using the `withMastra()` function.

- npm
- pnpm
- Yarn
- Bun

```bash
npm install @mastra/ai-sdk@latest
```

```bash
pnpm add @mastra/ai-sdk@latest
```

```bash
yarn add @mastra/ai-sdk@latest
```

```bash
bun add @mastra/ai-sdk@latest
```

## Examples [Direct link to Examples](https://mastra.ai/guides/agent-frameworks/ai-sdk\#examples "Direct link to Examples")

### With Processors [Direct link to With Processors](https://mastra.ai/guides/agent-frameworks/ai-sdk\#with-processors "Direct link to With Processors")

Processors let you transform messages before they're sent to the model (`processInput`) and after responses are received (`processOutputResult`). This example creates a logging processor that logs message counts at each stage, then wraps an OpenAI model with it.

src/example.ts

```typescript
import { openai } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { withMastra } from '@mastra/ai-sdk'
import type { Processor } from '@mastra/core/processors'

const loggingProcessor: Processor<'logger'> = {
  id: 'logger',
  async processInput({ messages }) {
    console.log('Input:', messages.length, 'messages')
    return messages
  },
  async processOutputResult({ messages }) {
    console.log('Output:', messages.length, 'messages')
    return messages
  },
}

const model = withMastra(openai('gpt-5.4'), {
  inputProcessors: [loggingProcessor],
  outputProcessors: [loggingProcessor],
})

const { text } = await generateText({
  model,
  prompt: 'What is 2 + 2?',
})
```

### With Memory [Direct link to With Memory](https://mastra.ai/guides/agent-frameworks/ai-sdk\#with-memory "Direct link to With Memory")

Memory automatically loads previous messages from storage before the LLM call and saves new messages after. This example configures a libSQL storage backend to persist conversation history, loading the last 10 messages for context.

src/memory-example.ts

```typescript
import { openai } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { withMastra } from '@mastra/ai-sdk'
import { LibSQLStore } from '@mastra/libsql'

const storage = new LibSQLStore({
  id: 'my-app',
  url: 'file:./data.db',
})
await storage.init()

const memoryStorage = await storage.getStore('memory')

const model = withMastra(openai('gpt-5.4'), {
  memory: {
    storage: memoryStorage!,
    threadId: 'user-thread-123',
    resourceId: 'user-123',
    lastMessages: 10,
  },
})

const { text } = await generateText({
  model,
  prompt: 'What did we talk about earlier?',
})
```

### With Processors & Memory [Direct link to With Processors & Memory](https://mastra.ai/guides/agent-frameworks/ai-sdk\#with-processors--memory "Direct link to With Processors & Memory")

You can combine processors and memory together. Input processors run after memory loads historical messages, and output processors run before memory saves the response.

src/combined-example.ts

```typescript
import { openai } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { withMastra } from '@mastra/ai-sdk'
import { LibSQLStore } from '@mastra/libsql'

const storage = new LibSQLStore({ id: 'my-app', url: 'file:./data.db' })
await storage.init()

const memoryStorage = await storage.getStore('memory')

const model = withMastra(openai('gpt-5.4'), {
  inputProcessors: [myGuardProcessor],
  outputProcessors: [myLoggingProcessor],
  memory: {
    storage: memoryStorage!,
    threadId: 'thread-123',
    resourceId: 'user-123',
    lastMessages: 10,
  },
})

const { text } = await generateText({
  model,
  prompt: 'Hello!',
})
```

## Related [Direct link to Related](https://mastra.ai/guides/agent-frameworks/ai-sdk\#related "Direct link to Related")

- [`withMastra()`](https://mastra.ai/reference/ai-sdk/with-mastra): API reference for `withMastra()`
- [Processors](https://mastra.ai/docs/agents/processors): Learn about input and output processors
- [Memory](https://mastra.ai/docs/memory/overview): Overview of Mastra's memory system
- [AI SDK UI](https://mastra.ai/guides/build-your-ui/ai-sdk-ui): Using AI SDK UI hooks with Mastra agents, workflows, and networks

On this page

- [Installation](https://mastra.ai/guides/agent-frameworks/ai-sdk#installation)
- [Examples](https://mastra.ai/guides/agent-frameworks/ai-sdk#examples)
  - [With Processors](https://mastra.ai/guides/agent-frameworks/ai-sdk#with-processors)
  - [With Memory](https://mastra.ai/guides/agent-frameworks/ai-sdk#with-memory)
  - [With Processors & Memory](https://mastra.ai/guides/agent-frameworks/ai-sdk#with-processors--memory)
- [Related](https://mastra.ai/guides/agent-frameworks/ai-sdk#related)

Mastra Newsletter

SubscribeShare feedback

reCAPTCHA

Recaptcha requires verification.

protected by **reCAPTCHA**