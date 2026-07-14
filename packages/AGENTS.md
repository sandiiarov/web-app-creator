# Packages DOX

## Purpose

- Owns shared internal workspace pkgs used by apps.

## Ownership

- `ui/`: shared shadcn/Tailwind React component pkg.
- `prompt-panel/`: landing-page prompt panel UI + conversation domain model; source-consumed by client.
- `conversation/`: canonical conversation model + shared event→turn reducer (`applyEventToTurn`/`replayClientEvents`/`terminalizeTools`) used by server (hydration) and client (live SSE stream); rolling `stats` upsert one latest snapshot per turn; terminal outcomes include durable stopped state separate from errors; tool-call parts may carry `{ alt, url }` image args for diagnostic previews.
- `landing-preview/`: shared landing-page preview iframe runtime, DOM morphing, browser screenshot capture; source-consumed by client via dedicated React Fast Refresh export. Iframe carries `key={reloadKey}`; `reloadPreview()` bumps that key — do NOT remove: browsers don't re-load `<iframe srcDoc>` when React updates the attr after an empty initial mount; without remount preview renders blank on project open + first live `html_update`.
- `agent-skills/`: Mastra agent skills on disk as markdown, exported as inline skills; landing-page `design` fork uses concise control plane + in-memory mode/foundation refs.
- `typescript-config/`: shared strict TypeScript 7 (tsc) configs.
- `vite-config/`: shared Vite React config factory.
- `vitest-preset/`: shared Vitest config factory.
- `oxlint-config/`: shared Oxlint config factory.
- `oxfmt-config/`: shared Oxfmt config factory.

## Local Contracts

- Pkgs expose public entries via `package.json` `exports`; consumers must import via pkg exports.
- Keep pkg scripts pkg-local; root orchestration → Turborepo.
- Workspace deps use `workspace:*`; shared 3rd-party versions → root `pnpm-workspace.yaml` catalog when reused.
- Config pkgs must stay generic; avoid app-specific runtime assumptions.
- Shared UI → `packages/ui`; app state + product-specific composition stay in apps.

## Work Guidance

- Prefer small typed factories/config exports over copied config files.
- New pkg: add under `packages/*`, give pkg-local scripts, ensure Turborepo runs standard tasks.

## Verification

- Focused: `pnpm --filter <package-name> typecheck`, `lint`, `format:check`, `test` when pkg declares it.
- All pkgs: `pnpm --filter './packages/*' typecheck`, `lint`, `format:check`.

## Child DOX Index

- `ui/AGENTS.md` — shared shadcn/Tailwind component system + globals.
- `prompt-panel/AGENTS.md` — extracted prompt panel UI + landing conversation domain model.
- `landing-preview/AGENTS.md` — extracted landing-page preview iframe runtime + screenshot capture.
- `agent-skills/AGENTS.md` — Mastra agent skills pkg + landing-page `design` skill contracts.