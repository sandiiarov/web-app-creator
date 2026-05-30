# web-app-creator

Vite + React client and Node.js server monorepo scaffolded with pnpm, Turborepo, shadcn/ui, almostnode, Vercel AI SDK, tsgo, Oxlint, Oxfmt, and Fallow.

## Requirements

- Node.js `>=22.18`
- pnpm `11.1.3`

## Workspace layout

```txt
apps/client              Vite React client
apps/server              Node.js server using the Vercel AI SDK
packages/ui              shadcn/ui components and Tailwind v4 globals
packages/typescript-config shared tsgo/TypeScript configs
packages/vite-config       shared Vite config factory
packages/oxlint-config     shared Oxlint config factory
packages/oxfmt-config      shared Oxfmt config factory
```

Root files are only workspace/orchestration files. TS, Vite, Oxlint, and Oxfmt config lives in each app/package and imports shared config packages.

## Client preview

`apps/client` renders a full-screen iframe. The iframe points to an in-browser Vite dev server created with almostnode `VirtualFS`, `ViteDevServer`, and `ServerBridge`.

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
- `POST /api/generate` with `{ "prompt": "...", "model": "optional-model-id" }`

Set `AI_GATEWAY_API_KEY` and optionally `AI_MODEL`, `HOST`, `PORT`, and `CLIENT_ORIGIN` in the server environment.

## shadcn/ui

Add components through the client app config so generated UI code lands in `packages/ui`:

```bash
pnpm dlx shadcn@latest add button -c apps/client
```

Import generated components from the UI package:

```tsx
import { Button } from '@workspace/ui/components/button'
```
