# Packages DOX

## Purpose

- Owns internal workspace packages shared by apps.

## Ownership

- `ui/`: shared shadcn/Tailwind React component package.
- `prompt-panel/`: landing-page prompt panel UI + conversation domain model, source-consumed by the client.
- `conversation/`: canonical conversation model + the shared event→turn reducer (`applyEventToTurn`/`replayClientEvents`/`terminalizeTools`) consumed by both the server (hydration) and the client (live SSE stream); terminal outcomes include durable stopped state separate from errors.
- `landing-preview/`: shared landing-page preview iframe runtime, DOM morphing, and browser screenshot capture, source-consumed by the client. The iframe carries `key={reloadKey}` and `reloadPreview()` bumps that key — do NOT remove it: browsers don't re-load an `<iframe srcDoc>` when React updates the attribute after an empty initial mount, so without the remount the preview renders blank on project open and on the first live `html_update`.
- `agent-skills/`: Mastra agent skills stored as on-disk markdown and exported as Mastra inline skills (currently the verbatim pi `design` skill, loaded from disk, not inlined).
- `typescript-config/`: shared strict TypeScript 7 (tsc) configs.
- `vite-config/`: shared Vite React config factory.
- `vitest-preset/`: shared Vitest config factory.
- `oxlint-config/`: shared Oxlint config factory.
- `oxfmt-config/`: shared Oxfmt config factory.

## Local Contracts

- Packages expose public entry points through `package.json` `exports`; consumers must import through package exports.
- Keep package scripts package-local; root orchestration belongs to Turborepo.
- Workspace dependencies use `workspace:*`; shared third-party versions belong in the root `pnpm-workspace.yaml` catalog when reused.
- Config packages must stay generic and avoid app-specific runtime assumptions.
- Shared UI belongs in `packages/ui`; application state and product-specific composition stay in apps.

## Work Guidance

- Prefer small typed factories/config exports over copied config files.
- When creating a new package, add it under `packages/*`, give it package-local scripts, and ensure Turborepo can run the standard tasks.

## Verification

- Focused: `pnpm --filter <package-name> typecheck`, `lint`, `format:check`, and `test` when the package declares it.
- All packages: `pnpm --filter './packages/*' typecheck`, `lint`, and `format:check`.

## Child DOX Index

- `ui/AGENTS.md` — shared shadcn/Tailwind component system and globals.
- `prompt-panel/AGENTS.md` — extracted prompt panel UI + landing conversation domain model.
- `landing-preview/AGENTS.md` — extracted landing-page preview iframe runtime and screenshot capture.
- `agent-skills/AGENTS.md` — Mastra agent skills package; verbatim pi `design` skill loaded from disk.
