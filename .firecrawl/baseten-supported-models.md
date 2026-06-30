> ## Documentation Index
>
> Fetch the complete documentation index at: [/llms.txt](https://docs.baseten.co/llms.txt)
>
> Use this file to discover all available pages before exploring further.

[Skip to main content](https://docs.baseten.co/inference/model-apis/overview#content-area)

[Documentation](https://docs.baseten.co/overview) [Examples](https://docs.baseten.co/examples/overview) [Reference](https://docs.baseten.co/reference/overview) [Status](https://docs.baseten.co/status/status)

Model APIs provide instant access to high-performance LLMs through endpoints that are compatible with both the [OpenAI Chat Completions API](https://docs.baseten.co/reference/inference-api/chat-completions) and the [Anthropic Messages API](https://docs.baseten.co/reference/inference-api/messages) (beta). Point your existing OpenAI or Anthropic SDK at Baseten’s inference endpoint and start making calls, no model deployment required.Unlike [dedicated deployments](https://docs.baseten.co/development/model/build-your-first-model), where you’d configure hardware, engines, and scaling yourself, Model APIs run on shared infrastructure that Baseten manages. You get a fixed set of popular models with optimized serving out of the box. When you need a model that isn’t in the supported list, or want dedicated GPUs with custom scaling, deploy your own with [Truss](https://docs.baseten.co/development/model/overview).

## [​](https://docs.baseten.co/inference/model-apis/overview\#supported-models)  Supported models

[Run inference](https://docs.baseten.co/inference/model-apis/overview#run-inference) against any Model API to get started.

| Model | Slug | Context | Max output |
| --- | --- | --- | --- |
| DeepSeek V4 Pro | `deepseek-ai/DeepSeek-V4-Pro` | 1048k | 1048k |
| GLM 4.7 | `zai-org/GLM-4.7` | 200k | 200k |
| GLM 5 | `zai-org/GLM-5` | 202k | 202k |
| GLM 5.1 | `zai-org/GLM-5.1` | 202k | 202k |
| GLM 5.2 | `zai-org/GLM-5.2` | 202k | 202k |
| Kimi K2.5 | `moonshotai/Kimi-K2.5` | 262k | 262k |
| Kimi K2.6 | `moonshotai/Kimi-K2.6` | 262k | 262k |
| Kimi K2.7 Code | `moonshotai/Kimi-K2.7-Code` | 262k | 262k |
| Nemotron Super | `nvidia/Nemotron-120B-A12B` | 202k | 202k |
| Nemotron Ultra | `nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B` | 202k | 202k |
| OpenAI GPT 120B | `openai/gpt-oss-120b` | 128k | 128k |

## [​](https://docs.baseten.co/inference/model-apis/overview\#pricing)  Pricing

Model APIs bill per million tokens. For current per-model rates, see the [Model APIs pricing page](https://www.baseten.co/pricing).Cached input tokens are prompt tokens served from the KV cache, billed at a discounted rate. Every request participates in caching automatically, with no flags or opt-in steps.

## [​](https://docs.baseten.co/inference/model-apis/overview\#feature-support)  Feature support

All models support [tool calling](https://docs.baseten.co/inference/function-calling) (also known as function calling), [structured outputs](https://docs.baseten.co/inference/structured-outputs), and [JSON mode](https://docs.baseten.co/inference/json-mode). See the table below for per-model coverage of reasoning and vision. For reasoning-specific configuration, see [Reasoning](https://docs.baseten.co/inference/model-apis/reasoning). For image and video inputs, see [Vision](https://docs.baseten.co/inference/model-apis/vision).

| Model | Tool calling | Structured outputs | JSON mode | Reasoning | Vision |
| --- | --- | --- | --- | --- | --- |
| DeepSeek V4 Pro | ✓ | ✓ | ✓ | Enabled by default | – |
| GLM 4.7 | ✓ | ✓ | ✓ | Opt-in | – |
| GLM 5 | ✓ | ✓ | ✓ | Opt-in | – |
| GLM 5.1 | ✓ | ✓ | ✓ | Opt-in | – |
| GLM 5.2 | ✓ | ✓ | ✓ | Opt-in | – |
| Kimi K2.5 | ✓ | ✓ | ✓ | Opt-in | ✓ |
| Kimi K2.6 | ✓ | ✓ | ✓ | Opt-in | ✓ |
| Kimi K2.7 Code | ✓ | ✓ | ✓ | Opt-in | – |
| Nemotron Super | ✓ | ✓ | ✓ | Opt-in | – |
| Nemotron Ultra | ✓ | ✓ | ✓ | Opt-in | – |
| OpenAI GPT 120B | ✓ | ✓ | ✓ | Enabled by default | – |

GLM models, Nemotron Super, and Nemotron Ultra also support `top_p` and `top_k` sampling parameters.

## [​](https://docs.baseten.co/inference/model-apis/overview\#run-inference)  Run inference

Model APIs support both OpenAI’s Chat Completions and Anthropic’s Messages APIs. Set your base URL, API key, and [model name](https://docs.baseten.co/inference/model-apis/overview#supported-models) to start making requests.

### [​](https://docs.baseten.co/inference/model-apis/overview\#use-the-openai-sdk)  Use the OpenAI SDK

Call supported models using the [OpenAI Chat Completions API](https://docs.baseten.co/reference/inference-api/chat-completions) at `https://inference.baseten.co/v1/chat/completions`.

- Python

- JavaScript

- cURL


chat\_completions.py

```
from openai import OpenAI
import os

client = OpenAI(
    base_url="https://inference.baseten.co/v1",
    api_key=os.environ["BASETEN_API_KEY"],
)

response = client.chat.completions.create(
    model="deepseek-ai/DeepSeek-V4-Pro",
    messages=[\
        {"role": "system", "content": "You are a concise technical writer."},\
        {"role": "user", "content": "What is gradient descent?"},\
        {"role": "assistant", "content": "An optimization algorithm that iteratively adjusts model parameters by moving in the direction of steepest decrease in the loss function."},\
        {"role": "user", "content": "How does the learning rate affect it?"}\
    ],
)

print(response.choices[0].message.content)
```

chat\_completions.js

```
import OpenAI from "openai";

const client = new OpenAI({
    baseURL: "https://inference.baseten.co/v1",
    apiKey: process.env.BASETEN_API_KEY,
});

const response = await client.chat.completions.create({
    model: "deepseek-ai/DeepSeek-V4-Pro",
    messages: [\
        { role: "system", content: "You are a concise technical writer." },\
        { role: "user", content: "What is gradient descent?" },\
        { role: "assistant", content: "An optimization algorithm that iteratively adjusts model parameters by moving in the direction of steepest decrease in the loss function." },\
        { role: "user", content: "How does the learning rate affect it?" }\
    ],
});

console.log(response.choices[0].message.content);
```

Request

```
curl https://inference.baseten.co/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BASETEN_API_KEY" \
  -d '{
    "model": "deepseek-ai/DeepSeek-V4-Pro",
    "messages": [\
      {"role": "system", "content": "You are a concise technical writer."},\
      {"role": "user", "content": "What is gradient descent?"},\
      {"role": "assistant", "content": "An optimization algorithm that iteratively adjusts model parameters by moving in the direction of steepest decrease in the loss function."},\
      {"role": "user", "content": "How does the learning rate affect it?"}\
    ]
  }'
```

Replace the model slug with any model from the supported models table.

### [​](https://docs.baseten.co/inference/model-apis/overview\#use-the-anthropic-sdk)  Use the Anthropic SDK

Call supported models using the [Anthropic Messages API](https://docs.baseten.co/reference/inference-api/messages) at `https://inference.baseten.co/v1/messages`.

Anthropic Messages API support is in **beta**. Behavior may change before general availability. For production workloads, use the [OpenAI Chat Completions API](https://docs.baseten.co/reference/inference-api/chat-completions).

- Python

- JavaScript

- cURL


messages\_api.py

```
import anthropic
import os

API_KEY = os.environ["BASETEN_API_KEY"]

client = anthropic.Anthropic(
    base_url="https://inference.baseten.co",
    api_key=API_KEY,
    default_headers={"Authorization": f"Bearer {API_KEY}"},
)

response = client.messages.create(
    model="deepseek-ai/DeepSeek-V4-Pro",
    max_tokens=4096,
    system="You are a concise technical writer.",
    messages=[\
        {"role": "user", "content": "What is gradient descent?"},\
        {"role": "assistant", "content": "An optimization algorithm that iteratively adjusts model parameters by moving in the direction of steepest decrease in the loss function."},\
        {"role": "user", "content": "How does the learning rate affect it?"}\
    ],
)

for block in response.content:
    if block.type == "text":
        print(block.text)
```

messages\_api.js

```
import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.BASETEN_API_KEY;

const client = new Anthropic({
    baseURL: "https://inference.baseten.co",
    apiKey: apiKey,
    defaultHeaders: { Authorization: `Bearer ${apiKey}` },
});

const response = await client.messages.create({
    model: "deepseek-ai/DeepSeek-V4-Pro",
    max_tokens: 4096,
    system: "You are a concise technical writer.",
    messages: [\
        { role: "user", content: "What is gradient descent?" },\
        { role: "assistant", content: "An optimization algorithm that iteratively adjusts model parameters by moving in the direction of steepest decrease in the loss function." },\
        { role: "user", content: "How does the learning rate affect it?" }\
    ],
});

for (const block of response.content) {
    if (block.type === "text") console.log(block.text);
}
```

Request

```
curl https://inference.baseten.co/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BASETEN_API_KEY" \
  -d '{
    "model": "deepseek-ai/DeepSeek-V4-Pro",
    "max_tokens": 4096,
    "system": "You are a concise technical writer.",
    "messages": [\
      {"role": "user", "content": "What is gradient descent?"},\
      {"role": "assistant", "content": "An optimization algorithm that iteratively adjusts model parameters by moving in the direction of steepest decrease in the loss function."},\
      {"role": "user", "content": "How does the learning rate affect it?"}\
    ]
  }'
```

The Anthropic SDK sends the API key as `x-api-key` by default. Baseten reads `Authorization`, so override `default_headers` as shown.

## [​](https://docs.baseten.co/inference/model-apis/overview\#list-available-models)  List available models

Query the `/v1/models` endpoint for the current list of models with metadata including pricing, context lengths, and supported features:

Request

```
curl https://inference.baseten.co/v1/models \
  -H "Authorization: Bearer $BASETEN_API_KEY"
```

## [​](https://docs.baseten.co/inference/model-apis/overview\#migrate)  Migrate

To migrate to Baseten, change the base URL, API key, and model name.

- OpenAI SDK

- Anthropic SDK


1. Replace your OpenAI API key with a [Baseten API key](https://app.baseten.co/settings/api_keys).
2. Change the base URL to `https://inference.baseten.co/v1`.
3. Update the model name to a Baseten model slug.

migrate.py

```
from openai import OpenAI
import os

client = OpenAI(
    base_url="https://inference.baseten.co/v1",
    api_key=os.environ["BASETEN_API_KEY"]
)

response = client.chat.completions.create(
    model="deepseek-ai/DeepSeek-V4-Pro",
    messages=[{"role": "user", "content": "Hello"}]
)
```

1. Replace your Anthropic API key with a [Baseten API key](https://app.baseten.co/settings/api_keys).
2. Change the base URL to `https://inference.baseten.co`.
3. Override `default_headers` so the SDK sends `Authorization` instead of `x-api-key`.
4. Update the model name to a [supported Baseten model slug](https://docs.baseten.co/inference/model-apis/overview#supported-models).

migrate.py

```
import anthropic
import os

API_KEY = os.environ["BASETEN_API_KEY"]

client = anthropic.Anthropic(
    base_url="https://inference.baseten.co",
    api_key=API_KEY,
    default_headers={"Authorization": f"Bearer {API_KEY}"},
)

response = client.messages.create(
    model="deepseek-ai/DeepSeek-V4-Pro",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello"}]
)
```

## [​](https://docs.baseten.co/inference/model-apis/overview\#handle-errors)  Handle errors

Model APIs return standard HTTP error codes:

| Code | Meaning |
| --- | --- |
| 400 | Invalid request (check your parameters) |
| 401 | Invalid or missing API key |
| 402 | Payment required |
| 404 | Model not found |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

Each error response includes a JSON body with details about the issue and suggested resolutions.

## [​](https://docs.baseten.co/inference/model-apis/overview\#next-steps)  Next steps

[**Reasoning** \\
\\
Control extended thinking for complex tasks](https://docs.baseten.co/inference/model-apis/reasoning)

[**Vision** \\
\\
Send images and videos alongside text](https://docs.baseten.co/inference/model-apis/vision)

[**Rate limits** \\
\\
Understand and configure rate limits](https://docs.baseten.co/inference/model-apis/rate-limits-and-budgets)

[**API reference** \\
\\
Complete parameter documentation](https://docs.baseten.co/reference/inference-api/chat-completions)

Was this page helpful?

YesNo

[Previous](https://docs.baseten.co/examples/deploy-a-hugging-face-model) [ReasoningControl extended thinking for reasoning-capable models\\
\\
Next](https://docs.baseten.co/inference/model-apis/reasoning)

Ctrl+I

Assistant

Responses are generated using AI and may contain mistakes.