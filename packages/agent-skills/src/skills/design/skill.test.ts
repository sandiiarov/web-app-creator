import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { design } from './skill.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const SKILL_FILE = join(HERE, 'SKILL.md')
const REFERENCES_DIR = join(HERE, 'references')

const EXPECTED_REFERENCE_FILES = [
  'border.md',
  'button.md',
  'checkup.md',
  'color.md',
  'create.md',
  'deslop.md',
  'finish.md',
  'interaction.md',
  'layout.md',
  'motion.md',
  'redesign.md',
  'refine.md',
  'relayout.md',
  'responsive.md',
  'review.md',
  'shadow.md',
  'smell.md',
  'tokenize.md',
  'typeset.md',
  'voice.md',
  'writing.md',
] as const

const FULL_PAGE_FOUNDATIONS = [
  'references/border.md',
  'references/button.md',
  'references/color.md',
  'references/interaction.md',
  'references/layout.md',
  'references/motion.md',
  'references/responsive.md',
  'references/shadow.md',
  'references/smell.md',
  'references/typeset.md',
  'references/voice.md',
  'references/writing.md',
] as const

type InlineSkillShape = {
  __inline?: true
  __referenceContents: Record<string, string>
  description: string
  instructions: string
  name: string
  references: string[]
}

function manifestLine(instructions: string, label: string): string {
  return (
    instructions
      .split('\n')
      .find((line) => line.startsWith(`- **${label}:**`)) ?? ''
  )
}

function markdownSection(
  instructions: string,
  heading: string,
  nextHeading: string,
): string {
  const start = instructions.indexOf(`### ${heading}`)
  const end = instructions.indexOf(`### ${nextHeading}`, start + 1)
  if (start === -1 || end === -1) return ''
  return instructions.slice(start, end)
}

function referencePaths(content: string): string[] {
  return [...content.matchAll(/`(references\/[a-z-]+\.md)`/gu)].map(
    (match) => match[1]!,
  )
}

describe('design skill', () => {
  const skill = design as InlineSkillShape

  it('parses the landing-page metadata and concise control plane', () => {
    expect(skill.name).toBe('design')
    expect(skill.description).toMatch(
      /Creates, edits, reviews, and redesigns/iu,
    )
    expect(skill.description).toMatch(/Required references must be read/iu)
    expect(skill.instructions.trim()).toMatch(/^# Design/u)
    expect(skill.instructions.length).toBeGreaterThanOrEqual(4_000)
    expect(skill.instructions.length).toBeLessThanOrEqual(15_000)
  })

  it('blocks mutation until complete required reads succeed', () => {
    expect(skill.instructions).toMatch(
      /Before the first `edit` or `generate_image`/u,
    )
    expect(skill.instructions).toMatch(/Omit `startLine` and `endLine`/u)
    expect(skill.instructions).toMatch(/every required read succeeded/u)
    expect(skill.instructions).toMatch(/does not count as a read/u)
    expect(skill.instructions).toMatch(
      /If it still fails, stop and explain the blocker/iu,
    )
    expect(skill.instructions).toMatch(
      /Do not continue with `edit` or `generate_image`/u,
    )
    expect(skill.instructions).toMatch(
      /supporting reference informs the active mode; it does not activate/iu,
    )
    expect(skill.instructions).toMatch(/exact one-element or one-viewport/iu)
  })

  it('requires the complete 13-reference bundles for full creation and redesign', () => {
    const creation = markdownSection(
      skill.instructions,
      'Full page creation',
      'Full page redesign',
    )
    const redesign = markdownSection(
      skill.instructions,
      'Full page redesign',
      'New section',
    )

    expect([...new Set(referencePaths(creation))].sort()).toEqual(
      [...FULL_PAGE_FOUNDATIONS, 'references/create.md'].sort(),
    )
    expect([...new Set(referencePaths(redesign))].sort()).toEqual(
      [...FULL_PAGE_FOUNDATIONS, 'references/redesign.md'].sort(),
    )
  })

  it.each([
    [
      'Border',
      [
        'references/border.md',
        'references/color.md',
        'references/interaction.md',
      ],
    ],
    [
      'Button',
      [
        'references/button.md',
        'references/interaction.md',
        'references/responsive.md',
        'references/writing.md',
      ],
    ],
    ['Checkup', ['references/checkup.md']],
    [
      'Deslop',
      [
        'references/checkup.md',
        'references/deslop.md',
        'references/review.md',
        'references/smell.md',
      ],
    ],
    [
      'Interaction',
      [
        'references/button.md',
        'references/interaction.md',
        'references/motion.md',
        'references/responsive.md',
        'references/writing.md',
      ],
    ],
    [
      'Motion',
      [
        'references/interaction.md',
        'references/motion.md',
        'references/responsive.md',
      ],
    ],
    [
      'Recolor',
      ['references/color.md', 'references/smell.md', 'references/voice.md'],
    ],
    [
      'Relayout or layout',
      [
        'references/layout.md',
        'references/relayout.md',
        'references/responsive.md',
      ],
    ],
    ['Review', ['references/review.md']],
    ['Smell', ['references/smell.md']],
    [
      'Typeset',
      [
        'references/responsive.md',
        'references/typeset.md',
        'references/voice.md',
        'references/writing.md',
      ],
    ],
  ])('declares the %s route with valid root-relative paths', (label, paths) => {
    expect(
      referencePaths(manifestLine(skill.instructions, label)).sort(),
    ).toEqual([...paths].sort())
  })

  it('uses only root-relative paths that resolve to loaded references', () => {
    const paths = referencePaths(skill.instructions)
    expect(paths.length).toBeGreaterThan(0)
    for (const path of paths) {
      expect(path).toMatch(/^references\/[a-z-]+\.md$/u)
      expect(EXPECTED_REFERENCE_FILES).toContain(
        path.slice(
          'references/'.length,
        ) as (typeof EXPECTED_REFERENCE_FILES)[number],
      )
    }
  })

  it('keeps stale workflows and ambiguous cross-reference links out of all content', () => {
    const allReferences = Object.values(skill.__referenceContents).join('\n')
    const allContent = `${skill.instructions}\n${allReferences}`
    const bannedPatterns = [
      /automatically reads/iu,
      /colorblind simulation/iu,
      /Composition Mass Calculator/iu,
      /Every one\. No exceptions/iu,
      /exactly 3 levels/iu,
      /HTML reports/iu,
      /Load only what the task needs/iu,
      /markdown reports/iu,
      /Provide a UI slider/iu,
      /random_jitter/iu,
      /Reading Distance Equation/iu,
      /return to the reports/iu,
      /silently.{0,40}read/iu,
      /Which reference files to pull/iu,
    ]

    for (const pattern of bannedPatterns) {
      expect(allContent).not.toMatch(pattern)
    }
    expect(allReferences).not.toMatch(/\]\([a-z-]+\.md\)/u)
  })

  it('lists exactly the contracted reference inventory from disk', () => {
    const files = readdirSync(REFERENCES_DIR)
      .filter((file) => file.endsWith('.md'))
      .sort()

    expect(files).toEqual(EXPECTED_REFERENCE_FILES)
    expect([...skill.references].sort()).toEqual(EXPECTED_REFERENCE_FILES)
  })

  it('loads every reference content from disk, keyed by filename', () => {
    for (const file of EXPECTED_REFERENCE_FILES) {
      expect(skill.__referenceContents[file]).toBe(
        readFileSync(join(REFERENCES_DIR, file), 'utf8'),
      )
    }
  })

  it('is a Mastra inline skill', () => {
    expect(skill.__inline).toBe(true)
  })

  it('keeps the SKILL.md source on disk alongside the loader', () => {
    expect(existsSync(SKILL_FILE)).toBe(true)
  })
})
