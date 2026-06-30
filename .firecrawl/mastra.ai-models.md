[Skip to main content](https://mastra.ai/models#__docusaurus_skipToContent_fallback)

Copy markdown

On this page

Mastra provides a unified interface for working with LLMs across multiple providers, giving you access to 4474 models from 134 providers through a single API.

## Features [Direct link to Features](https://mastra.ai/models\#features "Direct link to Features")

- **One API for any model**: Access any model without having to install and manage additional provider dependencies.

- **Access the newest AI**: Use new models the moment they're released, no matter which provider they come from. Avoid vendor lock-in with Mastra's provider-agnostic interface.

- [**Mix and match models**](https://mastra.ai/models#mix-and-match-models): Use different models for different tasks. For example, run GPT-5-mini for large-context processing, then switch to Claude Opus 4.6 for reasoning tasks.

- [**Model fallbacks**](https://mastra.ai/models#model-fallbacks): If a provider experiences an outage, Mastra can automatically switch to another provider at the application level, minimizing latency compared to API gateways.


## Basic usage [Direct link to Basic usage](https://mastra.ai/models\#basic-usage "Direct link to Basic usage")

Whether you're using OpenAI, Anthropic, Google, or a gateway like OpenRouter, specify the model as `"provider/model-name"` and Mastra handles the rest.

Mastra reads the relevant environment variable (e.g. `ANTHROPIC_API_KEY`) and routes requests to the provider. If an API key is missing, you'll get a clear runtime error showing exactly which variable to set.

- OpenAI
- Anthropic
- Google Gemini
- xAI
- OpenRouter

src/mastra/agents/my-agent.ts

```typescript
import { Agent } from "@mastra/core/agent";

const agent = new Agent({
  id: "my-agent",
  name: "My Agent",
  instructions: "You are a helpful assistant",
  model: "openai/gpt-5.5"
})
```

src/mastra/agents/my-agent.ts

```typescript
import { Agent } from "@mastra/core/agent";

const agent = new Agent({
  id: "my-agent",
  name: "My Agent",
  instructions: "You are a helpful assistant",
  model: "anthropic/claude-sonnet-4-6"
})
```

src/mastra/agents/my-agent.ts

```typescript
import { Agent } from "@mastra/core/agent";

const agent = new Agent({
  id: "my-agent",
  name: "My Agent",
  instructions: "You are a helpful assistant",
  model: "google/gemini-2.5-flash"
})
```

src/mastra/agents/my-agent.ts

```typescript
import { Agent } from "@mastra/core/agent";

const agent = new Agent({
  id: "my-agent",
  name: "My Agent",
  instructions: "You are a helpful assistant",
  model: "xai/grok-4"
})
```

src/mastra/agents/my-agent.ts

```typescript
import { Agent } from "@mastra/core/agent";

const agent = new Agent({
  id: "my-agent",
  name: "My Agent",
  instructions: "You are a helpful assistant",
  model: "openrouter/anthropic/claude-haiku-4.5"
})
```

## Model directory [Direct link to Model directory](https://mastra.ai/models\#model-directory "Direct link to Model directory")

Browse the directory of available models using the navigation on the left, or explore below.

[Gateways\\
\\
![OpenRouter](https://models.dev/logos/openrouter.svg)OpenRouter\\
\\
Netlify\\
\\
![Vercel](https://models.dev/logos/vercel.svg)Vercel\\
\+ 2 more](https://mastra.ai/models/gateways) [Providers\\
\\
![OpenAI](https://models.dev/logos/openai.svg)OpenAI\\
\\
![Anthropic](https://models.dev/logos/anthropic.svg)Anthropic\\
\\
![Google](https://models.dev/logos/google.svg)Google\\
\+ 126 more](https://mastra.ai/models/providers)

You can also discover models directly in your editor. Mastra provides full autocomplete for the `model` field - just start typing, and your IDE will show available options.

Alternatively, browse and test models in [Studio](https://mastra.ai/docs/studio/overview) UI.

info

In development, we auto-refresh your local model list every hour, ensuring your TypeScript autocomplete and Studio stay up-to-date with the latest models. To disable, set `MASTRA_AUTO_REFRESH_PROVIDERS=false`. Auto-refresh is disabled by default in production.

## Mix and match models [Direct link to Mix and match models](https://mastra.ai/models\#mix-and-match-models "Direct link to Mix and match models")

Some models are faster but less capable, while others offer larger context windows or stronger reasoning skills. Use different models from the same provider, or mix and match across providers to fit each task.

src/mastra/agents/reasoning-agent.ts

```typescript
import { Agent } from "@mastra/core/agent";

// Use a cost-effective model for document processing
const documentProcessor = new Agent({
  id: "document-processor",
  name: "Document Processor",
  instructions: "Extract and summarize key information from documents",
  model: "openai/gpt-4o-mini"
})

// Use a powerful reasoning model for complex analysis
const reasoningAgent = new Agent({
  id: "reasoning-agent",
  name: "Reasoning Agent",
  instructions: "Analyze data and provide strategic recommendations",
  model: "anthropic/claude-opus-4-1"
})
```

## Dynamic model selection [Direct link to Dynamic model selection](https://mastra.ai/models\#dynamic-model-selection "Direct link to Dynamic model selection")

Since models are just strings, you can select them dynamically based on [request context](https://mastra.ai/docs/server/request-context), variables, or any other logic.

src/mastra/agents/dynamic-assistant-agent.ts

```typescript
const agent = new Agent({
  id: "dynamic-assistant",
  name: "Dynamic Assistant",
  model: ({ requestContext }) => {
    const provider = requestContext.get("provider-id");
    const model = requestContext.get("model-id");
    return `${provider}/${model}`;
  },
});
```

This enables powerful patterns:

- A/B testing - Compare model performance in production.
- User-selectable models - Let users choose their preferred model in your app.
- Multi-tenant applications - Each customer can bring their own API keys and model preferences.

## Provider-specific options [Direct link to Provider-specific options](https://mastra.ai/models\#provider-specific-options "Direct link to Provider-specific options")

Different model providers expose their own configuration options. With OpenAI, you might adjust the `reasoningEffort`. With Anthropic, you might tune `cacheControl`. Mastra lets you set these specific `providerOptions` either at the agent level or per message.

src/mastra/agents/planner-agent.ts

```typescript
// Agent level (apply to all future messages)
const planner = new Agent({
  id: "planner",
  name: "Planner",
  instructions: {
    role: "system",
    content: "You are a helpful assistant.",
    providerOptions: {
      openai: { reasoningEffort: "low" }
    }
  },
  model: "openai/o3-pro",
});

const lowEffort =
  await planner.generate("Plan a simple 3 item dinner menu");

// Message level (apply only to this message)
const highEffort = await planner.generate([\
  {\
    role: "user",\
    content: "Plan a simple 3 item dinner menu for a celiac",\
    providerOptions: {\
      openai: { reasoningEffort: "high" }\
    }\
  }\
]);
```

## Custom headers [Direct link to Custom headers](https://mastra.ai/models\#custom-headers "Direct link to Custom headers")

If you need to specify custom headers, such as an organization ID or other provider-specific fields, use this syntax.

src/mastra/agents/custom-agent.ts

```typescript
const agent = new Agent({
  id: "custom-agent",
  name: "Custom Agent",
  model: {
    id: "openai/gpt-4-turbo",
    apiKey: process.env.OPENAI_API_KEY,
    headers: {
      "OpenAI-Organization": "org-abc123"
    }
  }
});
```

info

Configuration differs by provider. See the provider pages in the left navigation for details on custom headers.

## Model fallbacks [Direct link to Model fallbacks](https://mastra.ai/models\#model-fallbacks "Direct link to Model fallbacks")

Relying on a single model creates a single point of failure for your application. Model fallbacks provide automatic failover between models and providers. If the primary model becomes unavailable, requests are retried against the next configured fallback until one succeeds.

src/mastra/agents/resilient-assistant-agent.ts

```typescript
import { Agent } from '@mastra/core/agent';

const agent = new Agent({
  id: 'resilient-assistant',
  name: 'Resilient Assistant',
  instructions: 'You are a helpful assistant.',
  model: [\
    {\
      model: "openai/gpt-5",\
      maxRetries: 3,\
    },\
    {\
      model: "anthropic/claude-4-5-sonnet",\
      maxRetries: 2,\
    },\
    {\
      model: "google/gemini-2.5-pro",\
      maxRetries: 2,\
    },\
  ],
});
```

Mastra tries your primary model first. If it encounters a 500 error, rate limit, or timeout, it automatically switches to your first fallback. If that fails too, it moves to the next. Each model gets its own retry count before moving on.

Your users never experience the disruption - the response comes back with the same format, just from a different model. The error context is preserved as the system moves through your fallback chain, ensuring clean error propagation while maintaining streaming compatibility.

### Per-model settings [Direct link to Per-model settings](https://mastra.ai/models\#per-model-settings "Direct link to Per-model settings")

Each fallback entry can carry its own `modelSettings`, `providerOptions`, and `headers` — useful when models in the chain need different temperatures or provider-specific knobs to produce comparable output.

src/mastra/agents/tuned-resilient-agent.ts

```typescript
import { Agent } from '@mastra/core/agent';

const agent = new Agent({
  id: 'tuned-resilient',
  name: 'Tuned Resilient Agent',
  instructions: 'You are a helpful assistant.',
  model: [\
    {\
      model: 'google/gemini-2.5-flash',\
      maxRetries: 2,\
      modelSettings: { temperature: 0.3 },\
      providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },\
    },\
    {\
      model: 'openai/gpt-5-mini',\
      maxRetries: 2,\
      modelSettings: { temperature: 0.7 },\
      providerOptions: { openai: { reasoningEffort: 'low' } },\
    },\
  ],
});
```

**Precedence:**

- `modelSettings` and `providerOptions`: per-fallback entry overrides call-time options, which override agent `defaultOptions`. `modelSettings` shallow-merges by key. `providerOptions` deep-merges recursively, so nested provider config (e.g. `google.thinkingConfig`) preserves sibling keys across layers.
- `headers`: call-time `modelSettings.headers` overrides per-fallback `headers`, which overrides headers extracted from model-router models. Runtime headers (tracing, auth, tenancy) intentionally take precedence over model-level headers.

Each field also accepts a function of `requestContext`, matching how dynamic models are resolved.

## Use local models with Mastra [Direct link to Use local models with Mastra](https://mastra.ai/models\#use-local-models-with-mastra "Direct link to Use local models with Mastra")

Mastra also supports local models like `gpt-oss`, `Qwen3`, `DeepSeek` and many more that you run on your own hardware. The application running your local model needs to provide an OpenAI-compatible API server for Mastra to connect to. We recommend using [LMStudio](https://lmstudio.ai/) (see [Running the LMStudio server](https://lmstudio.ai/docs/developer/core/server)).

For custom OpenAI-compatible endpoints, `id` is the routing form that Mastra sends through the model router.

Use `provider/model` when the remote behaves like a direct provider and expects a bare model name such as `llama3.2`.

Use `gateway/provider/model` when the remote behaves like a model gateway and the upstream model namespace includes the provider, such as `mastra/google/gemini-2.5-flash` or `openrouter/google/gemini-2.5-flash`.

For the `url` it's **important** that you use the base URL of the OpenAI-compatible endpoint with Mastra's `model` setting and not the individual chat endpoints.

src/mastra/agents/my-agent.ts

```typescript
import { Agent } from "@mastra/core/agent";

const agent = new Agent({
  id: "my-agent",
  name: "My Agent",
  instructions: "You are a helpful assistant",
  model: {
    id: "custom/my-qwen3-model",
    url: "http://your-custom-openai-compatible-endpoint.com/v1"
  }
})
```

If the remote behaves like a model gateway, include the gateway prefix in `id`:

src/mastra/agents/my-agent.ts

```typescript
import { Agent } from "@mastra/core/agent";

const agent = new Agent({
  id: "my-agent",
  name: "My Agent",
  instructions: "You are a helpful assistant",
  model: {
    id: "mastra/google/gemini-2.5-flash",
    url: "http://your-custom-openai-compatible-endpoint.com/v1"
  }
})
```

### Example: LMStudio [Direct link to Example: LMStudio](https://mastra.ai/models\#example-lmstudio "Direct link to Example: LMStudio")

After starting the LMStudio server, the local server is available at `http://localhost:1234` and it provides endpoints like `/v1/models`, `/v1/chat/completions`, etc. The `url` will be `http://localhost:1234/v1`. For the `id` you can use (`lmstudio/${modelId}`) which will be displayed in the LMStudio interface.

src/mastra/agents/my-agent.ts

```typescript
import { Agent } from "@mastra/core/agent";

const agent = new Agent({
  id: "my-agent",
  name: "My Agent",
  instructions: "You are a helpful assistant",
  model: {
    id: "lmstudio/qwen/qwen3-30b-a3b-2507",
    url: "http://localhost:1234/v1"
  }
})
```

## Use AI SDK with Mastra [Direct link to Use AI SDK with Mastra](https://mastra.ai/models\#use-ai-sdk-with-mastra "Direct link to Use AI SDK with Mastra")

Mastra supports AI SDK provider modules, should you need to use them directly.

src/mastra/agents/my-agent.ts

```typescript
import { groq } from '@ai-sdk/groq';
import { Agent } from "@mastra/core/agent";

const agent = new Agent({
  id: "my-agent",
  name: "My Agent",
  model: groq('gemma2-9b-it')
})
```

You can use an AI SDK model (e.g. `groq('gemma2-9b-it')`) anywhere that accepts a `"provider/model"` string, including within model router fallbacks and [scorers](https://mastra.ai/docs/evals/overview).

On this page

- [Features](https://mastra.ai/models#features)
- [Basic usage](https://mastra.ai/models#basic-usage)
- [Model directory](https://mastra.ai/models#model-directory)
- [Mix and match models](https://mastra.ai/models#mix-and-match-models)
- [Dynamic model selection](https://mastra.ai/models#dynamic-model-selection)
- [Provider-specific options](https://mastra.ai/models#provider-specific-options)
- [Custom headers](https://mastra.ai/models#custom-headers)
- [Model fallbacks](https://mastra.ai/models#model-fallbacks)
  - [Per-model settings](https://mastra.ai/models#per-model-settings)
- [Use local models with Mastra](https://mastra.ai/models#use-local-models-with-mastra)
  - [Example: LMStudio](https://mastra.ai/models#example-lmstudio)
- [Use AI SDK with Mastra](https://mastra.ai/models#use-ai-sdk-with-mastra)

Mastra Newsletter

SubscribeShare feedback

reCAPTCHA

Recaptcha requires verification.

protected by **reCAPTCHA**