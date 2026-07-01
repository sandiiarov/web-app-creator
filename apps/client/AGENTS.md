# Client App DOX

## Purpose

- Vite + React app that lets a user manage landing-page projects, prompt a landing-page agent, and preview each generated single-file HTML.
- `/` lists saved projects; `/projects/new` creates a draft and redirects to `/projects/:id`; `/projects/:id` is the editor: an almostnode `VirtualFS` + `ViteDevServer` iframe preview plus a draggable prompt/conversation panel.

## Ownership

- `src/main.tsx`: `BrowserRouter` + route table (`/`, `/projects/new`, `/projects/:id`) and `ThemeProvider` root.
- `src/App.tsx`: `EditorPage` (preview + prompt panel composition), param-driven and keyed by project id.
- `src/components/projects-page.tsx`: project list + new-project redirect.
- `src/components/`: app-specific UI; `components/prompt/` owns conversation and composer components.
- `src/hooks/`: streaming/preview hooks.
- `src/lib/`: custom SSE client, landing-agent event types, preview bridge helpers, and the project REST API client.
- `public/__sw__.js`: almostnode service worker asset.
- `components.json`: shadcn project config that targets shared UI code in `packages/ui`.

## Local Contracts

- The server API is custom SSE `POST /agent` at `VITE_SERVER_URL` or `http://localhost:3001`; keep `src/lib/landing-agent.ts` event types aligned with `apps/server/src/mastra/route.ts`.
- The server owns the project's `index.html` file — it is the single source of truth. There is **no `html` SSE event** and **no client PUT**: after each successful `edit` tool completes, the UI calls `GET /api/projects/:id` and pulls the updated HTML (see `use-landing-page.ts` `refreshHtml` on `edit` done). On editor mount it also pulls the current HTML once.
- Projects are read via `src/lib/projects-api.ts` against `/api/projects*`. Stored HTML uses root-relative project image URLs (`/api/projects/:id/images/<file>`); `expandProjectImageUrls` expands them to absolute before writing into the preview VirtualFS (the preview iframe runs on a virtual almostnode origin).
- The preview writes only `/index.html` into the browser `VirtualFS`; the content is pulled from the server (it is not generated in the browser). Do not reintroduce a full workspace snapshot or browser AI SDK tool loop without updating plans and DOX.
- Use `@workspace/ui/...` for reusable UI package imports and `#components`, `#hooks`, `#lib` for app-local aliases.
- Do not put secrets in client code; only `VITE_*` variables are client-readable.
- Preserve the sharp/square visual language unless the design direction is explicitly changed.

## Work Guidance

- Follow shadcn/Tailwind rules: semantic tokens, `cn()` for conditional classes, `gap-*` over `space-*`, `size-*` for square dimensions, and existing UI components before custom markup.
- Keep streaming state changes in hooks and keep prompt UI components mostly presentational.
- Update the client event model and server SSE mapping together. Failed tool calls and failed turns must render with destructive/red styling and any still-running tool rows must be terminalized when a run errors, completes, or is stopped.

## Verification

- `pnpm --filter @workspace/client typecheck`
- `pnpm --filter @workspace/client lint`
- `pnpm --filter @workspace/client test`
- `pnpm --filter @workspace/client build`

## Child DOX Index

- None.
