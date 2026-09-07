import { fileURLToPath } from 'node:url'

import { LocalSkillSource, Workspace } from '@mastra/core/workspace'

/**
 * Skills-only workspace: exposes the on-disk `design` skill to the agent via
 * Mastra's built-in `skill`/`skill_read`/`skill_search` tools. No filesystem
 * or sandbox providers are configured, so no `mastra_workspace_*` tools are
 * added — `LocalSkillSource` reads skill files straight from disk.
 *
 * `basePath` resolves to this module's directory (`src/mastra/` in dev,
 * `dist/mastra/` after build — the build copies `skills/` alongside), so
 * skill discovery is independent of the process cwd.
 */
export function createLandingSkillsWorkspace(): Workspace {
  return new Workspace({
    id: 'landing-page-skills',
    name: 'Landing Page Skills',
    skills: ['./skills'],
    skillSource: new LocalSkillSource({
      basePath: fileURLToPath(new URL('.', import.meta.url)),
    }),
  })
}
