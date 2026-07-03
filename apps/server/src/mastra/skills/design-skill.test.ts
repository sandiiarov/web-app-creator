import { describe, expect, it } from 'vitest'

import {
  BROWSER_SAFE_REFERENCE_FILES,
  DESIGN_REFERENCES,
  designSkill,
} from './design-skill.ts'

type SkillShape = {
  __referenceContents: Record<string, string>
  instructions: string
  references: string[]
}

const EXPECTED_REFERENCE_FILES = [
  'border.md',
  'button.md',
  'color.md',
  'create.md',
  'finish.md',
  'interaction.md',
  'layout.md',
  'motion.md',
  'redesign.md',
  'refine.md',
  'relayout.md',
  'responsive.md',
  'shadow.md',
  'surface.md',
  'tokenize.md',
  'typeset.md',
  'voice.md',
  'writing.md',
]

const FORBIDDEN_PROMPT_PATTERNS = [
  /\bPi\b/u,
  /\blocal\b/iu,
  /\.commandcode/iu,
  /\.betterdesign/iu,
  /taste\.md/iu,
  /brief\.md/iu,
  /checkup-report/iu,
  /review-report/iu,
  /smell-report/iu,
  /report-html/iu,
  /design-html/iu,
  /setup document/iu,
  /auxiliary HTML/iu,
  /side output/iu,
]

describe('design skill browser runtime prompt', () => {
  const skill = designSkill as unknown as SkillShape
  const promptPayload = [
    skill.instructions,
    ...Object.entries(DESIGN_REFERENCES).map(
      ([name, content]) => `# ${name}\n${content}`,
    ),
  ].join('\n\n')

  it('uses the from-scratch browser reference set', () => {
    const expected = [...EXPECTED_REFERENCE_FILES].sort()

    expect([...BROWSER_SAFE_REFERENCE_FILES].sort()).toEqual(expected)
    expect(Object.keys(DESIGN_REFERENCES).sort()).toEqual(expected)
    expect(Object.keys(skill.__referenceContents).sort()).toEqual(expected)
    expect([...skill.references].sort()).toEqual(expected)
  })

  it('keeps every instruction anchored to the browser document', () => {
    expect(promptPayload).toContain('project HTML')
    expect(promptPayload).not.toContain('/index.html')
    expect(promptPayload).not.toMatch(/create\s+(?:a\s+)?(?:new\s+)?file/iu)
    expect(promptPayload).not.toMatch(/write\s+(?:a\s+)?(?:new\s+)?file/iu)
  })

  it('does not expose external design-workflow terms', () => {
    for (const pattern of FORBIDDEN_PROMPT_PATTERNS) {
      expect(promptPayload).not.toMatch(pattern)
    }
  })

  it('stays compact', () => {
    expect(skill.instructions.length).toBeLessThan(5_000)
  })
})
