# DOX framework

- DOX = fast AGENTS.md hierarchy, installed here
- Agent follow DOX instructions on every edit

## Core Contract

- AGENTS.md = binding work contracts for subtrees
- Work products, materials, instructions, records, assets, durable docs must stay understandable from nearest AGENTS.md + all parents above

## Read Before Editing

1. Read root AGENTS.md
2. Identify every file/folder you'll touch
3. Walk repo root → each target path
4. Read every AGENTS.md on each route
5. If parent lists child AGENTS.md whose scope contains path, read child, continue there
6. Nearest AGENTS.md = local contract; parent docs = repo-wide rules
7. Conflict? closer doc controls local details; no child weakens DOX

Don't rely on memory. Re-read DOX chain in current session before editing.

## Update After Editing

Every meaningful change needs DOX pass before done.

Update closest owning AGENTS.md when change affects:

- purpose, scope, ownership, responsibilities
- durable structure, contracts, workflows, operating rules
- required inputs, outputs, permissions, constraints, side effects, artifacts
- user prefs: behavior, communication, process, organization, quality
- AGENTS.md create, delete, move, rename, index contents

Update parent docs when parent structure/ownership/workflow/child index changes. Update child docs when parent changes alter local rules. Remove stale/contradictory text now. Small edits not changing behavior/contracts may skip docs, but DOX pass still required.

## Hierarchy

- Root AGENTS.md = DOX rail: project instructions, global prefs, durable workflow rules, top Child DOX Index
- Child AGENTS.md own domain instructions + own Child DOX Index
- Each parent explains direct children's coverage + what parent keeps
- Closer doc to work = more specific + practical

## Child Doc Shape

- Create child AGENTS.md when folder becomes durable boundary w/ own purpose, rules, responsibilities, workflow, materials, quality standards
- Work Guidance reflects current project standards/user instructions; none yet? leave empty
- Verification reflects existing check; no framework yet? leave empty, update when one exists

Default section order:

- Purpose
- Ownership
- Local Contracts
- Work Guidance
- Verification
- Child DOX Index

## Style

- Docs concise, current, operational
- Document stable contracts, not diary
- Broad rules in parent; concrete details in child
- Prefer direct bullets, explicit names
- No duplicate rules across files unless each scope needs local version
- Delete stale notes, don't explain history
- Trim obvious statements, repeated rules, misplaced detail, dead risk warnings

## Closeout

1. Re-check changed paths vs DOX chain
2. Update nearest owning docs + affected parents/children
3. Refresh every affected Child DOX Index
4. Remove stale/contradictory text
5. Run existing verification when relevant
6. Report docs left unchanged + why

## Project Contracts

- pnpm/Turborepo TypeScript monorepo, Node.js `>=22.19`, pnpm `11.1.3`.
- Workspaces under `apps/*` + `packages/*`; root scripts delegate via `turbo run`; task logic in package scripts.
- Active product: React client previews generated single-file HTML; Node/Mastra server streams landing-page agent via custom SSE.
- Dependencies use root `pnpm-workspace.yaml` catalog, `catalogMode: strict`; add catalog entries for shared versions.
- TypeScript 7 (native Go compiler, `tsc`) strict ESM via shared config pkgs; format/lint = Oxfmt/Oxlint. Catalog pins `typescript`; `@typescript/native-preview`/`tsgo` retired once TS 7 shipped stable as `typescript`.
- Keep generated/ignored outputs out of source edits: `node_modules`, `dist`, `coverage`, `.turbo`, `.fallow`, Mastra DB files, `apps/server/.mastra/{.build,output}`.
- Env files stay package-local; no root `.env`.
- `pnpm patch` applied to `@mastra/core` (`patches/@mastra__core@1.47.0.patch`, in `pnpm-workspace.yaml` `patchedDependencies`): OpenRouter ESM/CommonJS adapters buffer streamed tool args through end-of-stream, replace GLM-5.2 initial `{}` placeholder when real cumulative JSON follows, reject incomplete final JSON instead of coercing to `{}`; older generic OpenAI-compatible safeguard remains. `apps/server/src/mastra/lib/openrouter-tool-stream.test.ts` runs both patched adapters w/ fragmented streams. Re-verify patch + upstream behavior on every `@mastra/core` upgrade; re-create via `pnpm patch @mastra/core@<new>` if still needed.

## Verification

- Full repo: `pnpm run format:check`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`, `pnpm run build`.
- `pnpm --filter <workspace> <task>` for focused checks.
- Cleanup/risk audits: `pnpm run fallow:dead-code` or `pnpm run fallow:health`.

## User Preferences

- User requests durable behavior change? record here or relevant child AGENTS.md.
- Avoid tests asserting Markdown/system-prompt/prose wording. Test executable parsing/loading/inventory contracts + tool behavior; use review + live traces for prompt effectiveness.

## Child DOX Index

- `apps/AGENTS.md` — runnable app workspaces.
  - `apps/client/AGENTS.md` — Vite/React browser UI, custom SSE client, direct iframe preview.
  - `apps/server/AGENTS.md` — Node API, env contract, generated Mastra output boundary.
    - `apps/server/src/mastra/AGENTS.md` — Mastra landing-page agent, tools, model/cost/SSE logic.
- `packages/AGENTS.md` — shared internal workspace + config packages.
  - `packages/ui/AGENTS.md` — shadcn/Tailwind shared UI component system + globals.
  - `packages/prompt-panel/AGENTS.md` — prompt panel UI + landing conversation domain model.
  - `packages/landing-preview/AGENTS.md` — landing-page preview iframe runtime + screenshot capture.
  - `packages/agent-skills/AGENTS.md` — Mastra skills pkg (dormant: `design` skill retained, not imported).

Root-owned paths, no child DOX:

- Workspace orchestration/config: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `turbo.json`, `.gitignore`, `.fallowrc.jsonc`, `skills-lock.json`, `patches/`.
- Root docs/assets: `README.md`.
- `.pi/skills/*` symlinks managed by `.agents/` + root lockfile; edit `.agents/skills/*` sources.