# Agent Skills DOX

## Purpose

- Workspace pkg (`@workspace/agent-skills`) holds Mastra agent skills as on-disk md, exports `InlineSkill`.
- STATUS: DORMANT. `design` skill kept for reversibility, NOT imported anywhere. `design` experiment removed; agent has no `skill`/`skill_read`/`skill_search` tools. Design guidance owned by agent runtime (see `apps/server/src/mastra/AGENTS.md` for current mechanism).

## Ownership

- `src/index.ts`: pkg barrel; re-exports skill bundle.
- `src/skills/design/`: landing-page `design` skill, forked from pi design skill.
  - `SKILL.md`: compact lifecycle router.
  - `references/{create,iterate,review}.md`: lifecycle ref content (creation / iteration / review+finishing). Design methodology in 3 owning refs.
  - `skill.ts`: thin loader — reads `SKILL.md` + every `references/*.md` from disk via `import.meta.url`, parses frontmatter, builds Mastra `InlineSkill` thru `createSkill`.
  - `skill.test.ts`: executable loader contracts only (parsed metadata/instructions, exact ref inventory, inline-skill shape, source presence, byte parity w/ disk). Prompt prose verified by review + live traces, not regex.
- `package.json`, `tsconfig.json`, `oxfmt.config.ts`, `oxlint.config.ts`, `vitest.config.ts`: pkg scripts/config, workspace conventions.

## Local Contracts

- Still workspace dep of `@workspace/server` (`apps/server/package.json`), but zero imports outside own pkg. Kept reversible.
- Skill content in md on disk; never inline as TS strings. Loader reads disk @ runtime.
- Public surface (if re-activated): `import { design } from '@workspace/agent-skills'`; attach via `skills: [design]`.
- To re-activate: add `skills: [design]` to agent factory, restore skill tools, update `apps/server/src/mastra/AGENTS.md` together.
- Maintain as landing-page fork; don't re-copy pi src or reintroduce app-wide/file/report/CLI machinery.

## Work Guidance

- Keep `skill.ts` thin loader; advisory routing stays in `SKILL.md`.
- When adding/removing/renaming ref, update lifecycle router + loader inventory test + this DOX together.

## Verification

- `pnpm --filter @workspace/agent-skills format:check`
- `pnpm --filter @workspace/agent-skills lint`
- `pnpm --filter @workspace/agent-skills typecheck`
- `pnpm --filter @workspace/agent-skills test`
- `git diff --check -- packages/agent-skills packages/AGENTS.md`

## Child DOX Index

- None.