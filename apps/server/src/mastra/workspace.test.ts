import { describe, expect, it } from 'vitest'

import { createLandingSkillsWorkspace } from './workspace.ts'

/**
 * Executable inventory contract for the skills-only workspace: the `design`
 * skill is discovered from the on-disk `skills/` directory, and its lifecycle
 * references are readable through the same source the agent's `skill_read`
 * tool uses. Prompt prose is verified by review + live traces, not here.
 */
describe('landingSkillsWorkspace', () => {
  const landingSkillsWorkspace = createLandingSkillsWorkspace()
  it('discovers the design skill from the on-disk skills directory', async () => {
    const skills = await landingSkillsWorkspace.skills?.list()
    expect(skills?.map((skill) => skill.name)).toEqual(['design'])
  })

  it('loads the design skill with its three lifecycle references', async () => {
    const skill = await landingSkillsWorkspace.skills?.get('design')
    expect(skill).toBeDefined()
    expect(skill?.instructions).toContain('# Design')
    expect(skill?.references.slice().sort()).toEqual([
      'create.md',
      'iterate.md',
      'review.md',
    ])
  })

  it('reads each lifecycle reference through the skill source', async () => {
    for (const path of [
      'references/create.md',
      'references/iterate.md',
      'references/review.md',
    ]) {
      const content = await landingSkillsWorkspace.skills?.getReference(
        'design',
        path,
      )
      expect(content).toBeTruthy()
    }
  })
})
