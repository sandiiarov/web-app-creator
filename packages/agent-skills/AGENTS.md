# Agent Skills DOX

## Purpose

- Workspace package (`@workspace/agent-skills`) holding Mastra agent skills as on-disk markdown, loaded (not inlined) and exported as Mastra inline skills.

## Ownership

- `src/index.ts`: package entry; re-exports each skill bundle.
- `src/skills/design/`: the `design` skill — a landing-page fork derived from the pi design skill.
  - `SKILL.md`: skill source (YAML frontmatter `name`/`description` + markdown body used as instructions). Scoped to landing pages; the only writable surface is the project HTML via `read`/`find`/`edit`.
  - `references/*.md`: 21 reference files. `skill_read` serves them in-memory keyed by filename. Diverges from pi: no file/report/CLI machinery — `setup.md`, `report-html.md`, `design-html.md`, `surface.md` were dropped; `checkup`/`review`/`smell`/`deslop` run in memory (no report files); each file's own "do not create reports" rule is intact.
  - `skill.ts`: loads `SKILL.md` + `references/*.md` from disk via `import.meta.url`, parses the frontmatter, and builds the Mastra `InlineSkill` via `createSkill`.
  - `skill.test.ts`: guards that the loaded skill matches the files on disk.
- `package.json`, `tsconfig.json`, `oxfmt.config.ts`, `oxlint.config.ts`, `vitest.config.ts`: mirror the `conversation` package conventions (source-consumed, no build/dist).

## Local Contracts

- Skills are stored as markdown on disk and read at module load; never inline skill/reference content as TypeScript strings.
- The package is source-consumed via `exports: { ".": "./src/index.ts" }` (like `conversation`); Node 22.19 type-strips it in place at runtime, so `import.meta.url` always resolves to the package source and the `.md` files are always reachable. No `dist` asset-copy step.
- Public surface: `import { design } from '@workspace/agent-skills'` — `design` IS the Mastra `InlineSkill` (the `createSkill(...)` result). Attach directly to an Agent via `skills: [design]`. Reference contents live on `design.__referenceContents` (keyed by filename); `design.references` is the filename array.
- Reference keys are bare filenames (e.g. `color.md`), matching the Mastra `skill_read` path convention and the `references/<file>` links in `SKILL.md`.
- The `design` skill is landing-page-scoped and anchors the agent to the single project HTML document (`read`/`find`/`edit`, no files/reports). It complements — does not duplicate — the consumer's own instructions and tool guidance (hashline DSL, incremental build, "no markdown mockups" live in `LANDING_AGENT_INSTRUCTIONS` + tool guidance).

## Work Guidance

- The design skill is a fork of pi specialized for the landing-page agent (landing-scoped, no file/report/CLI machinery) — it intentionally diverges from the pi source. Edit the markdown in place; do not re-copy verbatim or you'll reintroduce file-creation and non-landing content.
- Keep `skill.ts` a thin loader; skill content lives in markdown.
- Follow the repo's `catalog:` dependency convention (`@mastra/core`) and shared config packages.

## Verification

- `pnpm --filter @workspace/agent-skills typecheck`
- `pnpm --filter @workspace/agent-skills lint`
- `pnpm --filter @workspace/agent-skills format:check`
- `pnpm --filter @workspace/agent-skills test`

## Child DOX Index

- None.
