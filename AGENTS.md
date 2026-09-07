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
- `pnpm patch` applied to `@mastra/core` (`patches/@mastra__core@1.47.0.patch`, in `pnpm-workspace.yaml` `patchedDependencies`): OpenRouter ESM/CommonJS adapters buffer streamed tool args through end-of-stream, replace GLM-5.2 initial `{}` placeholder when real cumulative JSON follows, reject incomplete final JSON instead of coercing to `{}`, and serialize multimodal tool-result `content` outputs (text + media) as chat-completions `text`/`image_url` parts instead of JSON-stringifying them (direct-mode screenshots reach vision-capable chat models); older generic OpenAI-compatible safeguard remains. `apps/server/src/mastra/lib/openrouter-tool-stream.test.ts` runs both patched adapters w/ fragmented streams; `openrouter-tool-result-image.test.ts` asserts multimodal + plain tool-result wire serialization on both. Re-verify patch + upstream behavior on every `@mastra/core` upgrade; re-create via `pnpm patch @mastra/core@<new>` if still needed. `@mastra/memory` is pinned exactly `1.25.0` (catalog comment): 1.26.x calls `storage.patchThread`, which core 1.47 + libsql 1.14 lack — OM crashes at runtime. Unpin only together with an @mastra/core + libsql bump.

## Verification

- Full repo: `pnpm run format:check`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`, `pnpm run build`.
- `pnpm --filter <workspace> <task>` for focused checks.
- Cleanup/risk audits: `pnpm run fallow:dead-code` or `pnpm run fallow:health`.

## User Preferences

- Generated-app direction, research only: Vite + React, not Next.js; AlmostNode browser dev; HMR replaces document morphing/morphdom. S3 static production, no Node server; pre-rendered HTML requirement unresolved. Preserve existing Vite builder shell.

- App design direction: the generated website is the workspace, with a compact floating chat widget that helps build it in place. Use liquid glass, restrained amber actions, smooth purposeful motion, readable light/dark surfaces, and a mobile overlay that preserves the page underneath. All rectangular app surfaces and controls have square corners (0px), including floating/docked/collapsed panels, menus, cards, and the visual proposal; avoid rounded cards and pill-shaped rectangular controls.

- Collapsed chat keeps a draggable header on desktop/mobile, clamped to the visible viewport. The logo is display-only; use the minimize/restore button to reopen. Animate collapse/expand from the panel’s top-right corner and menu-driven docking, never manual dragging/resizing; respect app/OS reduced motion. Preserve drafts, conversation, and expanded docking.

- Keep the small chat panel very compact: a small header, restrained padding and controls, no oversized decorative areas; prioritize conversation and composer space while retaining readable text and reachable actions. Task assignments and delegated briefs must be written in English.

- Use one unified chat panel with the same expanded/condensed header: small non-clickable blob logo, Projects, Refresh, Panel layout, Viewport, Minimize/restore. No visible project title or detached toolbar; keep the project title as the accessible panel name, and Settings/rename/export inside Panel layout. Left- and right-docked chat panels fill the full viewport height without top or bottom gaps; keep the compact header, reachable composer, and scrolling conversation. The approved reference is `.commandcode/design/reconsidered-preview.html`: a 352 × 360 floating panel, plain conversation text, an in-panel project switcher, and a compact resting composer. Preserve this approved composition.

- User requests durable behavior change? record here or relevant child AGENTS.md.
- Avoid tests asserting Markdown/system-prompt/prose wording. Test executable parsing/loading/inventory contracts + tool behavior; use review + live traces for prompt effectiveness.

## Child DOX Index

- `plans/AGENTS.md` — architecture implementation plans, dependency order, review evidence, and execution status; proposed behavior stays here until implemented.
- `apps/AGENTS.md` — runnable app workspaces.
  - `apps/client/AGENTS.md` — Vite/React browser UI, custom SSE client, direct iframe preview.
  - `apps/server/AGENTS.md` — Node API, env contract, generated Mastra output boundary.
    - `apps/server/src/mastra/AGENTS.md` — Mastra landing-page agent, tools, model/cost/SSE logic.
- `packages/AGENTS.md` — shared internal workspace + config packages.
  - `packages/contracts/AGENTS.md` — shared validated HTTP/SSE schemas and protocol byte limits.
  - `packages/ui/AGENTS.md` — shadcn/Tailwind shared UI component system + globals.
  - `packages/prompt-panel/AGENTS.md` — prompt panel UI + landing conversation domain model.
  - `packages/landing-preview/AGENTS.md` — landing-page preview iframe runtime + screenshot capture.

Root-owned paths, no child DOX:

- `.phases/` — ignored stage-gated research/plan/implementation/verification + evidence. Active AlmostNode/Vite research: `.phases/phase-almostnode-react-architecture/research.md`; implementation unapproved.

- Workspace orchestration/config: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `turbo.json`, `.gitignore`, `.fallowrc.jsonc`, `skills-lock.json`, `patches/`.
- Root docs/assets: `README.md`; `.commandcode/design/review-report.md` + `review-report.html` are paired design reviews, with findings kept separate from implemented behavior. `.commandcode/design/reconsidered-preview.html` is the approved isolated interactive design reference, with local simulated interactions and embedded project backdrops.
- `.commandcode/design/interface-review.md` — panel and project-library interface findings, implemented refinements, verification coverage, and limits.
- `.pi/skills/*` symlinks managed by `.agents/` + root lockfile; edit `.agents/skills/*` sources.
