# web-app-creator

Vite + React client and Node.js server monorepo scaffolded with pnpm, Turborepo, shadcn/ui, almostnode, Pi Agent SDK, tsgo, Oxlint, Oxfmt, and Fallow.

## Requirements

- Node.js `>=22.19`
- pnpm `11.1.3`

## Workspace layout

```txt
apps/client              Vite React client
apps/server              Node.js server using the Pi Agent SDK
packages/ui              shadcn/ui components and Tailwind v4 globals
packages/typescript-config shared tsgo/TypeScript configs
packages/vite-config       shared Vite config factory
packages/oxlint-config     shared Oxlint config factory
packages/oxfmt-config      shared Oxfmt config factory
```

Root files are only workspace/orchestration files. TS, Vite, Oxlint, and Oxfmt config lives in each app/package and imports shared config packages.

## Client preview

`apps/client` renders a full-screen iframe. The iframe points to an in-browser Vite dev server created with almostnode `VirtualFS`, `ViteDevServer`, and `ServerBridge`.

The preview app includes a bippy-powered inspector. Press `Command+G` or click **Select element**, choose an element in the iframe, then describe a change in the prompt box. The client sends selected fiber/source context plus the current preview files to the server. The server materializes those files in a per-request workspace, runs the Pi Agent SDK with guarded file tools and Docker Sandbox-backed bash against that workspace, returns changed files, and the browser applies them to the live `VirtualFS` so the iframe updates through HMR. You can also submit a prompt without selecting an element.

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
- `POST /agent` with the full preview file snapshot, selected element context, and user prompt

Set `OPENROUTER_API_KEY`, `AI_MODEL`, `APP_NAME`, `APP_URL`, `HOST`, `PORT`, `CLIENT_ORIGIN`, `AGENT_BASH_DRIVER`, and `AGENT_BASH_MAX_TIMEOUT_SECONDS` in `apps/server/.env`. For bash access, use `AGENT_BASH_DRIVER=docker-sandbox` and set `AGENT_BASH_SBX_AGENT`, `AGENT_BASH_SBX_CPUS`, `AGENT_BASH_SBX_MEMORY`, and `AGENT_BASH_SBX_TEMPLATE`; install Docker Sandboxes with `brew install docker/tap/sbx` and run `sbx login`. The server uses OpenRouter only and fails fast when any required env is missing. Set `VITE_SERVER_URL` for the client if the server is not running on `http://localhost:3001`.

## shadcn/ui

Add components through the client app config so generated UI code lands in `packages/ui`:

```bash
pnpm dlx shadcn@latest add button -c apps/client
```

Import generated components from the UI package:

```tsx
import { Button } from '@workspace/ui/components/button'
```
