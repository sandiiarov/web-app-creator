# DOX framework

- DOX is highly performant AGENTS.md hierarchy installed here
- Agent must follow DOX instructions across any edits

## Core Contract

- AGENTS.md files are binding work contracts for their subtrees
- Work products, source materials, instructions, records, assets, and durable docs must stay understandable from the nearest applicable AGENTS.md plus every parent AGENTS.md above it

## Read Before Editing

1. Read the root AGENTS.md
2. Identify every file or folder you expect to touch
3. Walk from the repository root to each target path
4. Read every AGENTS.md found along each route
5. If a parent AGENTS.md lists a child AGENTS.md whose scope contains the path, read that child and continue from there
6. Use the nearest AGENTS.md as the local contract and parent docs for repo-wide rules
7. If docs conflict, the closer doc controls local work details, but no child doc may weaken DOX

Do not rely on memory. Re-read the applicable DOX chain in the current session before editing.

## Update After Editing

Every meaningful change requires a DOX pass before the task is done.

Update the closest owning AGENTS.md when a change affects:

- purpose, scope, ownership, or responsibilities
- durable structure, contracts, workflows, or operating rules
- required inputs, outputs, permissions, constraints, side effects, or artifacts
- user preferences about behavior, communication, process, organization, or quality
- AGENTS.md creation, deletion, move, rename, or index contents

Update parent docs when parent-level structure, ownership, workflow, or child index changes. Update child docs when parent changes alter local rules. Remove stale or contradictory text immediately. Small edits that do not change behavior or contracts may leave docs unchanged, but the DOX pass still must happen.

## Hierarchy

- Root AGENTS.md is the DOX rail: project-wide instructions, global preferences, durable workflow rules, and the top-level Child DOX Index
- Child AGENTS.md files own domain-specific instructions and their own Child DOX Index
- Each parent explains what its direct children cover and what stays owned by the parent
- The closer a doc is to the work, the more specific and practical it must be

## Child Doc Shape

- Create a child AGENTS.md when a folder becomes a durable boundary with its own purpose, rules, responsibilities, workflow, materials, or quality standards
- Work Guidance must reflect the current standards of the project or user instructions; if there are no specific standards or instructions yet, leave it empty
- Verification must reflect an existing check; if no verification framework exists yet, leave it empty and update it when one exists

Default section order:
- Purpose
- Ownership
- Local Contracts
- Work Guidance
- Verification
- Child DOX Index

## Style

- Keep docs concise, current, and operational
- Document stable contracts, not diary entries
- Put broad rules in parent docs and concrete details in child docs
- Prefer direct bullets with explicit names
- Do not duplicate rules across many files unless each scope needs a local version
- Delete stale notes instead of explaining history
- Trim obvious statements, repeated rules, misplaced detail, and warnings for risks that no longer exist

## Closeout

1. Re-check changed paths against the DOX chain
2. Update nearest owning docs and any affected parents or children
3. Refresh every affected Child DOX Index
4. Remove stale or contradictory text
5. Run existing verification when relevant
6. Report any docs intentionally left unchanged and why

## Project Contracts

- This is a pnpm/Turborepo TypeScript monorepo using Node.js `>=22.19` and pnpm `11.1.3`.
- Workspaces live under `apps/*` and `packages/*`; root scripts must delegate through `turbo run`, while task logic belongs in package scripts.
- The active product path is a React client that previews generated single-file HTML and a Node/Mastra server that streams a landing-page agent over custom SSE.
- Dependencies use the root `pnpm-workspace.yaml` catalog with `catalogMode: strict`; add catalog entries for shared dependency versions.
- TypeScript is strict ESM via shared config packages and `tsgo`; formatting/linting use Oxfmt/Oxlint.
- Keep generated or ignored outputs out of source edits: `node_modules`, `dist`, `coverage`, `.turbo`, `.fallow`, Mastra DB files, and `apps/server/.mastra/{.build,output}`.
- Environment files stay package-local; do not create a root `.env`.

## Verification

- Full repo: `pnpm run format:check`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`, `pnpm run build`.
- Use `pnpm --filter <workspace> <task>` for focused checks.
- For cleanup/risk audits, use `pnpm run fallow:dead-code` or `pnpm run fallow:health`.

## User Preferences

When the user requests a durable behavior change, record it here or in the relevant child AGENTS.md

## Child DOX Index

- `.agents/AGENTS.md` — project-local skill source files; `.pi/skills/*` symlinks point there.
- `.scratch/AGENTS.md` — disposable experiments and reference scaffolds.
- `apps/AGENTS.md` — runnable app workspaces.
  - `apps/client/AGENTS.md` — Vite/React browser UI, custom SSE client, and direct iframe preview.
  - `apps/server/AGENTS.md` — Node API, env contract, generated Mastra output boundary.
    - `apps/server/src/mastra/AGENTS.md` — Mastra landing-page agent, tools, skills, model/cost/SSE logic.
- `packages/AGENTS.md` — shared internal workspace packages and config packages.
  - `packages/ui/AGENTS.md` — shadcn/Tailwind shared UI component system.
- `plans/AGENTS.md` — durable architecture plans and decision records.
- `screenshots/AGENTS.md` — visual verification artifacts and screenshot audit output.

Root-owned paths without a child DOX:

- Workspace orchestration/config: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `turbo.json`, `.gitignore`, `.fallowrc.jsonc`, `skills-lock.json`.
- Root docs/assets: `README.md`, `mastra-migration-plan.md`, `cv.html`, `self-healing-agent-loop.html`, `1440x900`.
- `.commandcode/design/` — generated design review/checkup/smell report artifacts.
- `.pi/skills/*` symlinks are managed by `.agents/` plus the root lockfile; edit the `.agents/skills/*` sources.
