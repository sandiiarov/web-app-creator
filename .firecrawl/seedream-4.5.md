![Favicon for bytedance-seed](https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://seed.bytedance.com/&size=256)

# ByteDance Seed: Seedream 4.5

### [bytedance-seed](https://openrouter.ai/bytedance-seed)/seedream-4.5

[Compare](https://openrouter.ai/compare/bytedance-seed/seedream-4.5) PlaygroundQuick Start

Seedream 4.5 is the latest in-house image generation model developed by ByteDance. Compared with Seedream 4.0, it delivers comprehensive improvements, especially in editing consistency, including better preservation of subject details, lighting, and color tone. It also enhances portrait refinement and small-text rendering. The model’s multi-image composition capabilities have been significantly strengthened, and both reasoning performance and visual aesthetics continue to advance, enabling more accurate and artistically expressive image generation.

Pricing is $0.04 per output image, regardless of size.

Modalities

Price

$0.04/image

Context

4K

Released

Dec 23, 2025

![Favicon for bytedance-seed](https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://seed.bytedance.com/&size=256)

ByteDance Seed: Seedream 4.5

[Compare](https://openrouter.ai/compare/bytedance-seed/seedream-4.5) PlaygroundQuick Start

Providers

## Providers

This model is hosted by one provider. OpenRouter forwards every request to it directly — no routing decisions to make.

| Provider | Output /img | Latency | Throughput | Uptime |
| --- | --- | --- | --- | --- |
| ![Favicon for Seed](https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://avatars.githubusercontent.com/u/4158466?v=4&size=256)<br>Seed | $0.04 | 16.96s | 1,079 tps | 100.00% |

## Effective Pricing

The chart below shows the average price customers are actually paying after prompt caching. Depending on the amount of repeated context you send, this can be 60–80% cheaper than the provider list price. Shown are rolling averages from the past 30 days.

### Weighted Average

Weighted Avg Input Price

$0.0000

/M tokens

Weighted Avg Output Price

$2.52

/M tokens

| Provider | Input $/1M | Output $/1M | Cache hit rate | Token share |
| --- | --- | --- | --- | --- |
| ![Favicon for Seed](https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://avatars.githubusercontent.com/u/4158466?v=4&size=256)<br>Seed | $0.0000 | $2.52 | 0.0% | 100.0% |

### Input Price / 1M tokens (7 days)

Jun 21Jun 22Jun 23Jun 24Jun 25Jun 26Jun 27Jun 2801234$/1M

### Output Price / 1M tokens (7 days)

Jun 21Jun 22Jun 23Jun 24Jun 25Jun 26Jun 27Jun 2800.61.21.82.4$/1M

## Performance

Throughput is how fast the model writes (tokens per second — higher is better). Latency is total round-trip time (lower is better). TTFT is time-to-first-token — how long before you see anything appear (lower is better).

Throughput

1079tok/s

best across providers

Latency

16.95s

p50, best provider

All locations1 week

### Throughput

Seed

Avg1101 tok/s

### Latency

Seed

Avg15.40 s

### E2E Latency

Seed

Avg31.73 s

### Cache Hit Rate

Seed

Avg0.00 %

## Uptime

Percent of requests that succeeded over the last 30 days. OpenRouter monitors every provider continuously and automatically retries on the next-best provider when one returns an error.

Avg. Provider Uptime (3d)

100.00%

averaged across all endpoints

When an error occurs in an upstream provider, we can recover by routing to another healthy provider, if your request filters allow it. You can access uptime data programmatically through the [Endpoints API](https://openrouter.ai/docs/api/api-reference/endpoints/list-endpoints). [Learn more](https://openrouter.ai/docs/provider-routing) about our load balancing and customization options.

## Benchmarks

Scores on standardized evaluations. Higher percentages are better — and rank percentile shows where this model lands among all models on OpenRouter.

Overall Text to Image ArenaTop 46%

1,166Elo

#29·8K matches

### Arena Rank

#29

### Arena Appearances

8K

### Category Performance

AnimeTop 27%

1,235Elo

608 matches

Cartoon & IllustrationTop 44%

1,170Elo

712 matches

CommercialTop 49%

1,154Elo

625 matches

Fantasy & MythicalTop 27%

1,236Elo

1.1K matches

Futuristic & Sci-FiTop 46%

1,165Elo

1K matches

General & PhotorealisticTop 43%

1,175Elo

2.8K matches

Graphic Design & Digital RenderingTop 53%

1,139Elo

2.3K matches

Nature & LandscapesTop 49%

1,153Elo

669 matches

OtherTop 47%

1,162Elo

535 matches

People: Groups & ActivitiesTop 30%

1,226Elo

823 matches

People: PortraitsTop 37%

1,198Elo

784 matches

Physical SpacesTop 58%

1,118Elo

1K matches

Text & TypographyTop 64%

1,096Elo

483 matches

Traditional ArtTop 25%

1,245Elo

514 matches

UI/UX DesignTop 48%

1,158Elo

463 matches

Vintage & RetroTop 49%

1,151Elo

537 matches

Metrics sourced from [Artificial Analysis](https://artificialanalysis.ai/models/seedream-4-5)

## Apps

Public apps that send the most traffic to this model. Good signal for what real production workloads look like — and a hint at which use cases this model is best suited for.

## Activity

Token volume and request traffic to this model over time.

Images

May 29May 31Jun 2Jun 4Jun 6Jun 8Jun 10Jun 12Jun 14Jun 16Jun 18Jun 20Jun 22Jun 24Jun 26Jun 2810K20K30K40K

Image Outputs

15K

Image Inputs

13K

Image inputs count visual attachments processed in prompts. Image outputs count generated images. Some requests may process or generate multiple images.

## Quick Start

Drop-in code to call this model. OpenRouter's API is OpenAI-compatible — most SDKs work by just swapping the base URL. The only thing that changes between models is the model slug below.

1

### Get your API key

Create an API key from your OpenRouter dashboard and set it as an environment variable:

[Create API Key](https://openrouter.ai/settings/keys)

Copy

shell

```
export OPENROUTER_API_KEY=sk-or-v1-...
```

2

### Generate an image

Use the dedicated Image API with `bytedance-seed/seedream-4.5`:

Send a prompt and receive generated images as base64-encoded data. [Learn more about image generation](https://openrouter.ai/docs/features/multimodal/image-generation).

PythonTypeScript (fetch)cURL

Copy

python

```
import requests

import json

import base64

response = requests.post(

  url="https://openrouter.ai/api/v1/images",

  headers={

    "Authorization": "Bearer <OPENROUTER_API_KEY>",

    "Content-Type": "application/json",

  },

  data=json.dumps({

    "model": "bytedance-seed/seedream-4.5",

    "prompt": "A serene mountain landscape at sunset with dramatic clouds"

  })

)

result = response.json()

for i, image in enumerate(result.get("data", [])):

  image_bytes = base64.b64decode(image["b64_json"])

  with open(f"output_{i}.png", "wb") as f:

    f.write(image_bytes)

  print(f"Saved image {i + 1}")
```

### Endpoint

Submits an image generation request. Returns base64-encoded images or streams partial results via SSE.

[Docs](https://openrouter.ai/docs/features/multimodal/image-generation)

POST`https://openrouter.ai/api/v1/images`

Authorization`Bearer $OPENROUTER_API_KEY`

Content-Type`application/json`

HTTP-Referer`optional — your site URL, for rankings`

X-Title`optional — your site name, for rankings`

Model`bytedance-seed/seedream-4.5`

### Supported Parameters

| Parameter | Type | Values |
| --- | --- | --- |
| `resolution` | enum | 1K, 2K, 4K |
| `aspect_ratio` | enum | 1:1, 1:2, 2:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 9:19.5, 19.5:9, 9:20, 20:9, 9:21, 21:9, auto |
| `n` | range | 1–10 |
| `input_references` | range | 0–14 |
| `seed` | boolean | Supported |

## More models from [bytedance-seed](https://openrouter.ai/bytedance-seed)

[Seed-2.0-Lite\\
\\
Seed-2.0-Lite is a versatile, cost‑efficient enterprise workhorse that delivers strong multimodal and agent capabilities while offering noticeably lower latency, making it a practical default choice for most production workloads across text, vision, and tools. Engineered for high-frequency visual understanding and agentic workflows, it's an ideal choice for deployment at scale with minimal latency.](https://openrouter.ai/bytedance-seed/seed-2.0-lite)

[Seed-2.0-Mini\\
\\
Seed-2.0-mini targets latency-sensitive, high-concurrency, and cost-sensitive scenarios, emphasizing fast response and flexible inference deployment. It delivers performance comparable to ByteDance-Seed-1.6, supports 256k context, four reasoning effort modes (minimal/low/medium/high), multimodal understanding, and is optimized for lightweight tasks where cost and speed take priority.](https://openrouter.ai/bytedance-seed/seed-2.0-mini)

[Seed 1.6 Flash\\
\\
Seed 1.6 Flash is an ultra-fast multimodal deep thinking model by ByteDance Seed, supporting both text and visual understanding. It features a 256k context window and can generate outputs of up to 16k tokens.](https://openrouter.ai/bytedance-seed/seed-1.6-flash)

[Seed 1.6\\
\\
Seed 1.6 is a general-purpose model released by the ByteDance Seed team. It incorporates multimodal capabilities and adaptive deep thinking with a 256K context window.](https://openrouter.ai/bytedance-seed/seed-1.6)

Previous slideNext slide

[Compare](https://openrouter.ai/compare/bytedance-seed/seedream-4.5) Playground