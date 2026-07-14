# Agent Skills DOX

## Purpose

- Workspace pkg (`@workspace/agent-skills`) holds Mastra agent skills as on-disk md, exports as `InlineSkill`.

## Ownership

- `src/index.ts`: pkg entry; re-xports each skill bundle.
- `src/skills/design/`: landing-page `design` skill forked frm pi design skill.
  - `SKILL.md`: concise advisory ctrl plane. Owns single-doc scope, scenario guidance, `skill ref | when to use` idx, convo-scoped read reuse, broad vs narrow behavior, achievable verification, truthful completion.
  - `references/*.md`: 16 landing-page refs split into 7 modes (`create`, `finish`, `redesign`, `refine`, `relayout`, `review`, `smell`) + 9 foundations (`voice`, `layout`, `color`, `typeset`, `writing`, `responsive`, `interaction`, `surface`, `motion`). `review` covers quick+thorough diagnostics; `smell` covers generated-pattern dx+treatment; `interaction` owns CTA behavior; `surface` owns borders/radius/depth.
  - `skill.ts`: reads `SKILL.md` + every `references/*.md` from disk via `import.meta.url`, parses frontmatter, builds Mastra `InlineSkill` thru `createSkill`.
  - `skill.test.ts`: verifies executable loader contracts only: parsed metadata/instructions, exact ref inventory, inline-skill shape, source presence, byte parity w/ disk. Prompt prose + md wording verified by review + live traces, not regex assertions.
- `package.json`, `tsconfig.json`, `oxfmt.config.ts`, `oxlint.config.ts`, `vitest.config.ts`: pkg scripts/config following workspace conventions.

## Local Contracts

- Skill content lives in md on disk; never inline instructions/refs as TS strings.
- Pkg source-consumed thru `exports: { ".": "./src/index.ts" }`. Node type-strips src @ runtime, so md stays available w/o `dist` asset-copy step.
- Public surface: `import { design } from '@workspace/agent-skills'`. `design` is Mastra `InlineSkill`, attaches directly via `skills: [design]`.
- Inline ref-content keys: `create.md`, `iterate.md`, `review.md`; agent `skill_read` calls use root-relative `references/<file>.md` paths.
- `SKILL.md`: compact lifecycle router. `create.md` consolidates full-page foundations, `iterate.md` covers focused edits thru redesign, `review.md` covers dx/finishing/generated-pattern cleanup.
- User intent selects 1 starting ref: creation loads `create.md`, follow-up changes load `iterate.md`, review/finishing loads `review.md`. Agent does not preload all 3.
- Successful full reads stay useful thru same project convo. Later turns reuse available lifecycle ctx, read only newly needed ref; broad redesign w/o creation ctx may use both `iterate.md` + `create.md`.
- Only writable design surface = single project HTML doc. Skill creates no reports/briefs/mockups/alt HTML files/design docs.
- Verification limited to source inspection + consumer's named mobile/tablet/desktop screenshot profiles. Skill must not claim unavailable interaction/AT/simulation/profiling/exact-width/prolonged-usage checks.
- Skill complements vs duplicates consumer instructions/tool guidance. Hashline DSL, incremental edit mechanics, tool schemas, UI transcript behavior stay owned by `LANDING_AGENT_INSTRUCTIONS` + landing tools.

## Work Guidance

- Maintain as landing-page fork; don't re-copy pi src or reintroduce app-wide/file/report/CLI machinery. Keep generic app state systems, destructive workflows, component-lib abstraction, unrelated code-org guidance out of refs.
- Keep `skill.ts` thin loader, keep advisory routing in `SKILL.md`.
- Keep ctrl plane concise. Detailed design methodology belongs in 1 owning ref, not repeated across root + many refs.
- When adding/removing/renaming ref, update lifecycle router, loader inventory test, this DOX together; verify routing w/ live trace.
- Keep tests off prompt prose + md wording. Test executable parsing/loading/inventory/tool behavior instead.
- Keep lifecycle refs distinct: creation owns page foundations, iteration owns requested changes, review owns dx + final treatment. Supporting ctx never determines mutation breadth.

## Verification

- `pnpm --filter @workspace/agent-skills format:check`
- `pnpm --filter @workspace/agent-skills lint`
- `pnpm --filter @workspace/agent-skills typecheck`
- `pnpm --filter @workspace/agent-skills test`
- `git diff --check -- packages/agent-skills packages/AGENTS.md`

## Child DOX Index

- None.