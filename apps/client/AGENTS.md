# Client App DOX

## Purpose

- Vite + React app that lets a user prompt a landing-page agent and previews the generated single-file HTML.
- Hosts an almostnode `VirtualFS` + `ViteDevServer` iframe preview and a draggable prompt/conversation panel.

## Ownership

- `src/App.tsx`: top-level preview + prompt panel composition.
- `src/components/`: app-specific UI; `components/prompt/` owns conversation and composer components.
- `src/hooks/`: streaming/preview hooks.
- `src/lib/`: custom SSE client, landing-agent event types, and preview bridge helpers.
- `public/__sw__.js`: almostnode service worker asset.
- `components.json`: shadcn project config that targets shared UI code in `packages/ui`.

## Local Contracts

- The server API is custom SSE `POST /agent` at `VITE_SERVER_URL` or `http://localhost:3001`; keep `src/lib/landing-agent.ts` event types aligned with `apps/server/src/mastra/route.ts`.
- The preview writes only `/index.html` into the browser `VirtualFS`; do not reintroduce a full workspace snapshot or browser AI SDK tool loop without updating plans and DOX.
- Use `@workspace/ui/...` for reusable UI package imports and `#components`, `#hooks`, `#lib` for app-local aliases.
- Do not put secrets in client code; only `VITE_*` variables are client-readable.
- Preserve the sharp/square visual language unless the design direction is explicitly changed.

## Work Guidance

- Follow shadcn/Tailwind rules: semantic tokens, `cn()` for conditional classes, `gap-*` over `space-*`, `size-*` for square dimensions, and existing UI components before custom markup.
- Keep streaming state changes in hooks and keep prompt UI components mostly presentational.
- Update the client event model and server SSE mapping together.

## Verification

- `pnpm --filter @workspace/client typecheck`
- `pnpm --filter @workspace/client lint`
- `pnpm --filter @workspace/client test`
- `pnpm --filter @workspace/client build`

## Child DOX Index

- None.
