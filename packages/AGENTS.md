# Packages DOX

## Purpose

- Shared internal workspace pkgs for apps.

## Ownership

- `ui/`: shared shadcn/Tailwind React component pkg.
- `prompt-panel/`: landing prompt panel UI + conversation domain model; source-consumed by client.
- `conversation/`: canonical conversation model + shared event→turn reducer (`applyEventToTurn`/`replayClientEvents`/`terminalizeTools`) used by server (hydration) + client (live SSE stream); rolling `stats` upsert latest snapshot per turn; terminal outcomes = durable stopped state separate from errors; tool-call parts may carry `{ alt, url }` image args for diagnostic previews.
- `landing-preview/`: shared landing preview iframe runtime, DOM morphing, browser screenshot capture; source-consumed by client via dedicated React Fast Refresh export. Iframe carries `key={reloadKey}`; `reloadPreview()` bumps key — do NOT remove: browsers don't re-load `<iframe srcDoc>` when React updates attr after empty initial mount; without remount preview blank on project open + first live `html_update`.
- `agent-skills/`: Mastra skills pkg on disk as md, exported as `InlineSkill`. DORMANT — `design` skill retained for reversibility, not imported anywhere (design guidance in agent runtime, not this pkg; see `apps/server/src/mastra/AGENTS.md`).
- `typescript-config/`: shared strict TypeScript 7 (tsc) configs.
- `vite-config/`: shared Vite React config factory.
- `vitest-preset/`: shared Vitest config factory.
- `oxlint-config/`: shared Oxlint config factory.
- `oxfmt-config/`: shared Oxfmt config factory.

## Local Contracts

- Pkgs expose public entries via `package.json` `exports`; consumers import via pkg exports.
- Keep pkg scripts pkg-local; root orchestration → Turborepo.
- Workspace deps use `workspace:*`; shared 3rd-party versions → root `pnpm-workspace.yaml` catalog when reused.
- Config pkgs stay generic; no app-specific runtime assumptions.
- Shared UI → `packages/ui`; app state + product composition stay in apps.

## Work Guidance

- Prefer typed factories/config exports over copied config files.
- New pkg: add under `packages/*`, pkg-local scripts, ensure Turborepo runs standard tasks.

## Verification

- Focused: `pnpm --filter <package-name> typecheck`, `lint`, `format:check`, `test` when pkg declares.
- All pkgs: `pnpm --filter './packages/*' typecheck`, `lint`, `format:check`.

## Child DOX Index

- `ui/AGENTS.md` — shared shadcn/Tailwind component system + globals.
- `prompt-panel/AGENTS.md` — extracted prompt panel UI + landing conversation domain model.
- `landing-preview/AGENTS.md` — extracted landing preview iframe runtime + screenshot capture.
- `agent-skills/AGENTS.md` — Mastra skills pkg (dormant: `design` skill retained, not imported).