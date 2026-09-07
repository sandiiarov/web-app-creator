# Packages DOX

## Purpose

- Shared internal workspace pkgs for apps.

## Ownership

- `ui/`: shared shadcn/Tailwind React component pkg.
- `prompt-panel/`: landing prompt panel UI + conversation domain model; source-consumed by client.
- `contracts/`: framework-free Zod schemas and inferred wire types for commands, acknowledgments, v2 project/list snapshots and events, plus shared UTF-8/frame limits. It may import conversation domain types; conversation never imports contracts.
- `conversation/`: canonical conversation model + shared event→turn reducer (`applyEventToTurn`/`replayClientEvents`/`terminalizeTools`) used by server hydration and client live SSE. It understands legacy prompt/stats/error/done records plus canonical `run_accepted`, nonterminal `run_blocked`, and authoritative `run_terminal` records keyed by turn ID. Canonical terminal data overrides provisional legacy outcome fields. Rolling `stats` upserts the latest snapshot per turn; `memory` compaction cycles upsert by cycle id; tool-call parts may carry `{ alt, url }` image args. Parts and turns retain timing derived from envelope timestamps so replay matches live delivery.
- `landing-preview/`: shared landing preview iframe runtime, DOM morphing, browser screenshot capture; source-consumed by client via dedicated React Fast Refresh export. Iframe carries `key={reloadKey}`; `reloadPreview()` bumps key — do NOT remove: browsers don't re-load `<iframe srcDoc>` when React updates attr after empty initial mount; without remount preview blank on project open + first live `html_update`.
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
- `contracts/AGENTS.md` — validated HTTP/SSE wire schemas and protocol limits.
- `prompt-panel/AGENTS.md` — extracted prompt panel UI + landing conversation domain model.
- `landing-preview/AGENTS.md` — extracted landing preview iframe runtime + screenshot capture.
