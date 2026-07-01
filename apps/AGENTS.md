# Apps DOX

## Purpose

- Owns runnable workspace applications under `apps/*`.

## Ownership

- `client/`: Vite + React browser UI and direct iframe preview runtime.
- `server/`: Node HTTP server and Mastra landing-page agent API.

## Local Contracts

- Each app owns its package scripts; root scripts only delegate through `turbo run`.
- Shared cross-app code belongs in `packages/*`, not in another app's source tree.
- App code imports shared packages through `@workspace/*` package exports, never by relative paths into package internals.
- Environment files stay app-local; do not introduce a root `.env`.

## Work Guidance

- Keep per-app `tsconfig`, `vite`, `vitest`, `oxlint`, and `oxfmt` config wired to shared workspace config packages.
- Use `pnpm --filter @workspace/client ...` and `pnpm --filter @workspace/server ...` for focused app work.

## Verification

- Client: `pnpm --filter @workspace/client typecheck`, `lint`, `test`, `build`.
- Server: `pnpm --filter @workspace/server typecheck`, `lint`, `test`, `build`.

## Child DOX Index

- `client/AGENTS.md` — browser UI, prompt panel, custom SSE client, and direct iframe preview.
- `server/AGENTS.md` — Node API, environment contract, and Mastra server integration.
