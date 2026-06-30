# web-app-creator

Vite + React client and Node.js server monorepo scaffolded with pnpm, Turborepo, shadcn/ui, almostnode, Vercel AI SDK, tsgo, Oxlint, Oxfmt, and Fallow.

## Requirements

- Node.js `>=22.19`
- pnpm `11.1.3`

## Workspace layout

```txt
apps/client              Vite React client
apps/server              Node.js server and Docker Sandbox AI SDK runner
packages/ui              shadcn/ui components and Tailwind v4 globals
packages/typescript-config shared tsgo/TypeScript configs
packages/vite-config       shared Vite config factory
packages/oxlint-config     shared Oxlint config factory
packages/oxfmt-config      shared Oxfmt config factory
```

Root files are only workspace/orchestration files. TS, Vite, Oxlint, and Oxfmt config lives in each app/package and imports shared config packages.

## Client preview

`apps/client` renders a full-screen iframe. The iframe points to an in-browser Vite dev server created with almostnode `VirtualFS`, `ViteDevServer`, and `ServerBridge`.

The preview app includes a bippy-powered inspector. Press `Command+G` or click **Select element**, choose an element in the iframe, then describe a change in the prompt box. The client sends selected fiber/source context plus the current preview files to the server. The server streams status events while it creates or reuses a Docker Sandbox, runs a Vercel AI SDK `ToolLoopAgent` inside that sandbox, and returns changed files. The browser applies the final result to the live `VirtualFS` so the iframe updates through HMR. You can also submit a prompt without selecting an element.

The sandbox agent ships a `/design`-style taste layer: a vendored design skill (`apps/server/sandbox/skills/design`) the agent reads on demand (`list_skills`, `read_skill`), a Design Philosophy baked into its system prompt, and a model-graded design review that runs after the correctness harness passes. High-severity "AI design slop" tells feed the same fix loop as lint/typecheck failures, so generated UI is checked for both correctness and taste.

The almostnode service worker is served from `apps/client/public/__sw__.js`, so the shared/client Vite plugin configuration stays unchanged.

## Commands

```bash
pnpm install
pnpm run dev
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run build
pnpm run fallow:dead-code
pnpm run fallow:health
```

## Server

The server exposes:

- `GET /health`
- `POST /agent` as an SSE stream with status events and a final result event
- `POST /landing-agent` for a Vercel AI SDK + Baseten single-file HTML landing page agent, including token usage, plus `list_skills`/`read_skill` tools backed by the shipped `design` skill
- `POST /preview/format` for fixed-config Oxfmt formatting
- `POST /preview/lint` for fixed-config Oxlint diagnostics
- `POST /preview/typecheck` for fixed-config `tsgo --noEmit` diagnostics

Preview tool endpoints accept only `/package.json`, `/index.html`, and `/src/**` snapshot files. They materialize those files under a temp directory, generate trusted config files, and never run user package scripts or user-provided lint config.

Set `BASETEN_API_KEY`, `APP_NAME`, `APP_URL`, `HOST`, `PORT`, `CLIENT_ORIGIN`, `MODEL_GATEWAY_BASE_URL`, `SANDBOX_AGENT`, `SANDBOX_COMMAND_TIMEOUT_SECONDS`, `SANDBOX_CPUS`, `SANDBOX_CREATE_TIMEOUT_SECONDS`, `SANDBOX_IDLE_TTL_SECONDS`, `SANDBOX_MEMORY`, `SANDBOX_TEMPLATE`, and `SANDBOX_WORKSPACE_ROOT` in `apps/server/.env`. `AI_MODEL` is optional and defaults to Baseten GLM 5.2 (`zai-org/GLM-5.2`); set `AI_MODEL=moonshotai/Kimi-K2.7-Code` to use Kimi. Optionally set `BASETEN_MODEL_URL` for a dedicated Baseten `/sync/v1` model endpoint. Optionally set `FIRECRAWL_API_KEY` so the landing-page `scrape_website` tool uses Firecrawl with higher rate limits; without it, Firecrawl uses its keyless free tier. Optionally set `DESIGN_SKILL_ROOT` to override where the landing-page `list_skills`/`read_skill` tools look for the `design` skill (defaults to `apps/server/sandbox/skills`). Use `SANDBOX_IDLE_TTL_SECONDS=60` to release idle sandbox resources after about one minute while keeping the chat session/workspace registered for later requests. Install Docker Sandboxes with `brew install docker/tap/sbx`, run `sbx login`, and build/load the sandbox template with `pnpm --filter @workspace/server sandbox:template`. The server uses Baseten for model calls and fails fast when any required env is missing. Set `VITE_SERVER_URL` for the client if the server is not running on `http://localhost:3001`.

## shadcn/ui

Add components through the client app config so generated UI code lands in `packages/ui`:

```bash
pnpm dlx shadcn@latest add button -c apps/client
```

Import generated components from the UI package:

```tsx
import { Button } from '@workspace/ui/components/button'
```
