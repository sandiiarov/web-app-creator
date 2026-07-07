# web-app-creator

Generate single-file HTML landing pages from a prompt. A Vite + React client previews the page in a sandboxed iframe; a Node + [Mastra](https://mastra.ai) server streams a landing-page agent over [OpenRouter](https://openrouter.ai) and streams the result back as SSE.

## Requirements

- Node.js `>=22.19`
- pnpm `11.1.3`

## Workspace layout

```txt
apps/client               Vite + React client (iframe preview + prompt panel)
apps/server               Node HTTP server + Mastra landing-page agent
packages/ui               shadcn/ui components and Tailwind v4 globals
packages/prompt-panel     prompt-panel conversation model and React UI
packages/landing-preview  shared HTML sanitization/expansion for the preview iframe
packages/vite-config      shared Vite config factory
packages/typescript-config shared tsgo/TypeScript configs
packages/oxlint-config    shared Oxlint config factory
packages/oxfmt-config     shared Oxfmt config factory
packages/vitest-preset    shared Vitest config
```

Root files are workspace/orchestration only. TS, Vite, Oxlint, and Oxfmt config lives in each app/package and imports the shared config packages.

## Architecture

**Client** (`apps/client`) renders generated HTML in a full-screen sandboxed `srcDoc` iframe. It pulls each project's HTML through `GET /api/projects/:id`, expands project image URLs to absolute server URLs, and feeds the HTML into the iframe. After every successful agent `edit` tool call it refetches the project HTML and replaces the iframe document. The prompt panel and message history are browser UI; project HTML, messages, and screenshots live in the server's file-backed store.

**Server** (`apps/server`) is a plain `node:http` server that owns projects on disk and streams the agent:

- `POST /agent` — SSE stream. Body `{ prompt: string, projectId: string, textModel?: string, imageModel?: string, visionModel?: string, attachments?: attachment[] }`. Emits `text`, `thinking`, `tool_call`, `tool_call_drop`, `html_update`, `stats`, `screenshot_request`, `retry`, `error`, and `done` events.
- `POST /api/screenshot-responses/:requestId` — browser POST-back that resolves a pending `screenshot_request` (bytes persisted once to disk; only metadata is logged).
- `GET /api/projects` — list projects with generated HTML.
- `POST /api/projects` — create a project. Body `{ textModel?: string, title?: string }`.
- `GET /api/projects/:id` — get a project (HTML + hydrated message turns).
- `PATCH /api/projects/:id` — update project model. Body `{ textModel: string }`.
- `DELETE /api/projects/:id` — delete a project.
- `GET /api/projects/:id/images/:file` — serve a persisted project image.
- `GET /images/:id` — serve a generated image (`http://<host>/images/img-1.jpg`).

**The agent** is a Mastra agent backed by OpenRouter. It builds the page with these tools: `scrape` (Firecrawl a reference URL + OCR its images), `read`/`find` (inspect the current HTML as compact `anchor|text` lines), `edit` (anchor-based HTML edits), `screenshot` (ask the browser to render and visually QA the page), and `generate_image` (OpenRouter image model). A `design` skill is injected as system-prompt guidance.

**Per-project data** lives under `.data/projects/<id>/`: `project.json` (metadata), `html.json` (current document), `client-messages.jsonl` (append-only client wire — one line per SSE event out + inbound request), `agent-messages.jsonl` (per-step Mastra message snapshots), `vision-messages.json` (OCR calls), `screenshots/` (captured bytes), and `images/` (generated images). Legacy `messages.json` / `raw-messages.json` are read-only fallbacks for older projects.

## Commands

```bash
pnpm install
pnpm run dev            # client + server (HMR)
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm run test
pnpm run build
pnpm run fallow:dead-code
pnpm run fallow:health
```

Focused checks: `pnpm --filter @workspace/server test -- --run`, etc.

## Environment

The server reads `apps/server/.env` (package-local; do not create a root `.env`). Nothing throws on a missing key — but `OPENROUTER_API_KEY` is required for real runs.

**Models (OpenRouter)** — all optional, sensible defaults:

| Var | Default |
|-----|---------|
| `OPENROUTER_API_KEY` | — (required for runs) |
| `OPENROUTER_API_URL` | `https://openrouter.ai/api/v1` |
| `OPENROUTER_CHAT_MODEL` | `z-ai/glm-5.2` |
| `OPENROUTER_IMAGE_MODEL` | `bytedance-seed/seedream-4.5` |
| `OPENROUTER_VISION_MODEL` | `z-ai/glm-5v-turbo` |

**Other** — all optional:

| Var | Default | Purpose |
|-----|---------|---------|
| `FIRECRAWL_API_KEY` | — | enables the `scrape` tool's keyed Firecrawl tier (free tier otherwise) |
| `FIRECRAWL_CREDIT_USD` | `0.002` | per-scrape cost for stats |
| `MASTRA_PROJECT_ID` / `MASTRA_PLATFORM_ACCESS_TOKEN` | — | optional Mastra platform telemetry |
| `CLIENT_ORIGIN` | `*` | CORS allow-origin |
| `HOST` / `PORT` | `0.0.0.0` / `3001` | bind address |
| `AGENT_MODEL_MAX_RETRIES` | `0` | per-call model retries |
| `AGENT_RETRY_BASE_DELAY_MS` / `AGENT_RETRY_MAX_DELAY_MS` | `1000` / `10000` | retry backoff |
| `AGENT_STREAM_ERROR_MAX_RETRIES` | `10` | mid-stream error retries |

Set `VITE_SERVER_URL` on the client if the server is not at `http://localhost:3001`.

## shadcn/ui

Add components through the client app config so generated UI code lands in `packages/ui`:

```bash
pnpm dlx shadcn@latest add button -c apps/client
```

Import generated components from the UI package:

```tsx
import { Button } from '@workspace/ui/components/button'
```
