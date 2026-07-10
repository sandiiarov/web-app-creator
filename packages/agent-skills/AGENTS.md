# Agent Skills DOX

## Purpose

- Workspace package (`@workspace/agent-skills`) holding Mastra agent skills as on-disk markdown and exporting them as inline skills.

## Ownership

- `src/index.ts`: package entry; re-exports each skill bundle.
- `src/skills/design/`: landing-page `design` skill forked from the pi design skill.
  - `SKILL.md`: concise advisory control plane. Owns single-document scope, scenario guidance, the `skill ref | when to use` index, conversation-scoped read reuse, broad versus narrow behavior, achievable verification, and truthful completion.
  - `references/*.md`: 16 landing-page references split into 7 operation modes (`create`, `finish`, `redesign`, `refine`, `relayout`, `review`, `smell`) and 9 design foundations (`voice`, `layout`, `color`, `typeset`, `writing`, `responsive`, `interaction`, `surface`, `motion`). `review` covers quick and thorough diagnostics; `smell` covers generated-pattern diagnosis and treatment; `interaction` owns CTA behavior; `surface` owns borders, radius, and depth.
  - `skill.ts`: reads `SKILL.md` plus every `references/*.md` from disk via `import.meta.url`, parses frontmatter, and builds the Mastra `InlineSkill` through `createSkill`.
  - `skill.test.ts`: guards metadata, bounded control-plane size, advisory scenario/reference routing, exact reference inventory and paths, stale-workflow exclusions, and byte parity with disk.
- `package.json`, `tsconfig.json`, `oxfmt.config.ts`, `oxlint.config.ts`, `vitest.config.ts`: package scripts/config following workspace conventions.

## Local Contracts

- Skill content lives in markdown on disk; never inline instructions or references as TypeScript strings.
- The package is source-consumed through `exports: { ".": "./src/index.ts" }`. Node type-strips source at runtime, so markdown remains available without a `dist` asset-copy step.
- Public surface: `import { design } from '@workspace/agent-skills'`. `design` is the Mastra `InlineSkill` and attaches directly through `skills: [design]`.
- Inline reference-content keys are bare filenames (for example `color.md`), while agent `skill_read` calls use root-relative paths (for example `references/color.md`).
- `SKILL.md` is the routing index. References do not claim automatic loading or duplicate the scenario/reference tables.
- Reference routing is advisory rather than a hard mutation gate. Successful full reads remain useful throughout the same project conversation; follow-ups reuse them and scenario changes add only newly relevant references. New page creation/redesign begin with an 11-reference cross-discipline set, while focused requests use smaller matching sets.
- Reading a supporting foundation informs the active operation; it does not activate a page-wide foundation mode or broaden explicit user scope.
- The only writable design surface is the single project HTML document. The skill creates no reports, briefs, mockups, alternate HTML files, or design documentation. Diagnostic findings stay in the answer; treatment applies through project edits.
- Verification is limited to source inspection and the consumer's named mobile/tablet/desktop screenshot profiles. The skill must not claim unavailable interaction, assistive-technology, simulation, profiling, exact-width, or prolonged-usage checks.
- The skill complements rather than duplicates consumer instructions/tool guidance. Hashline DSL, incremental edit mechanics, tool schemas, and UI transcript behavior remain owned by `LANDING_AGENT_INSTRUCTIONS` and landing tools.

## Work Guidance

- Maintain this as a landing-page fork; do not re-copy the pi source or reintroduce app-wide/file/report/CLI machinery. Keep generic application state systems, destructive workflows, component-library abstraction, and unrelated code-organization guidance out of its references.
- Keep `skill.ts` a thin loader and keep advisory routing behavior in `SKILL.md`.
- Keep the control plane concise. Detailed design methodology belongs in one owning reference, not repeated across the root and many references.
- When adding or removing a reference, update the scenario/reference tables, expected inventory, route contract tests, and this DOX together.
- Keep operation references focused on workflow and foundation references focused on one design dimension. Supporting references never determine mutation breadth.

## Verification

- `pnpm --filter @workspace/agent-skills format:check`
- `pnpm --filter @workspace/agent-skills lint`
- `pnpm --filter @workspace/agent-skills typecheck`
- `pnpm --filter @workspace/agent-skills test`
- `git diff --check -- packages/agent-skills packages/AGENTS.md`

## Child DOX Index

- None.
