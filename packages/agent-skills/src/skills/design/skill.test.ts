import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { design } from './skill.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const SKILL_FILE = join(HERE, 'SKILL.md')
const REFERENCES_DIR = join(HERE, 'references')

const EXPECTED_REFERENCE_FILES = [
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
  'review.md',
  'smell.md',
  'surface.md',
  'typeset.md',
  'voice.md',
  'writing.md',
] as const

const FULL_PAGE_FOUNDATIONS = [
  'references/color.md',
  'references/interaction.md',
  'references/layout.md',
  'references/motion.md',
  'references/responsive.md',
  'references/smell.md',
  'references/surface.md',
  'references/typeset.md',
  'references/voice.md',
  'references/writing.md',
] as const

const OPERATION_REFERENCE_PATHS = [
  'references/create.md',
  'references/finish.md',
  'references/redesign.md',
  'references/refine.md',
  'references/relayout.md',
  'references/review.md',
  'references/smell.md',
] as const

const FOUNDATION_REFERENCE_PATHS = [
  'references/color.md',
  'references/interaction.md',
  'references/layout.md',
  'references/motion.md',
  'references/responsive.md',
  'references/surface.md',
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

function markdownSection(
  instructions: string,
  heading: string,
  nextHeading: string,
): string {
  const start = instructions.indexOf(heading)
  const end = instructions.indexOf(nextHeading, start + 1)
  if (start === -1 || end === -1) return ''
  return instructions.slice(start, end)
}

function referencePaths(content: string): string[] {
  return [...content.matchAll(/`(references\/[a-z-]+\.md)`/gu)].map(
    (match) => match[1]!,
  )
}

function tableRow(instructions: string, label: string): string {
  return (
    instructions.split('\n').find((line) => line.startsWith(`| ${label} |`)) ??
    ''
  )
}

describe('design skill', () => {
  const skill = design as InlineSkillShape

  it('parses the landing-page metadata and concise advisory control plane', () => {
    expect(skill.name).toBe('design')
    expect(skill.description).toMatch(
      /creating, editing, reviewing, and redesigning/iu,
    )
    expect(skill.description).toMatch(/scenario and reference tables/iu)
    expect(skill.instructions.trim()).toMatch(/^# Design/u)
    expect(skill.instructions.length).toBeGreaterThanOrEqual(4_000)
    expect(skill.instructions.length).toBeLessThanOrEqual(15_000)
  })

  it('describes advisory routing and conversation-scoped reference reuse', () => {
    expect(skill.instructions).toMatch(/## Scenario guide/u)
    expect(skill.instructions).toMatch(/## Reference guide/u)
    expect(skill.instructions).toMatch(
      /A successful full reference read remains useful throughout the same project conversation/iu,
    )
    expect(skill.instructions).toMatch(
      /Follow-up requests reuse that context/iu,
    )
    expect(skill.instructions).toMatch(
      /consult only references that add context not already present/iu,
    )
    expect(skill.instructions).toMatch(/tables below are routing aids/iu)
    expect(skill.instructions).toMatch(/Omitting `startLine` and `endLine`/u)
  })

  it('suggests the complete broad context for new-page creation and redesign', () => {
    const creation = tableRow(skill.instructions, 'New page')
    const redesign = tableRow(skill.instructions, 'Full-page redesign')

    expect([...new Set(referencePaths(creation))].sort()).toEqual(
      [...FULL_PAGE_FOUNDATIONS, 'references/create.md'].sort(),
    )
    expect([...new Set(referencePaths(redesign))].sort()).toEqual(
      [...FULL_PAGE_FOUNDATIONS, 'references/redesign.md'].sort(),
    )
  })

  it.each([
    'New page',
    'New page inspired by or recreated from a URL',
    'Redesign a page supplied by URL',
    'Continue an unfinished page',
    'Edit an existing page',
    'Add a new section',
    'Full-page redesign',
    'Finish',
    'Refine',
    'Diagnostic only',
    'Generated-pattern cleanup',
    'Generate or replace imagery',
  ])('describes the %s scenario', (label) => {
    expect(tableRow(skill.instructions, label)).not.toBe('')
  })

  it('indexes every operation and foundation reference once', () => {
    const operations = markdownSection(
      skill.instructions,
      '### Operation references',
      '### Foundation references',
    )
    const foundations = markdownSection(
      skill.instructions,
      '### Foundation references',
      '## Scope and precedence',
    )

    expect(referencePaths(operations).sort()).toEqual(
      [...OPERATION_REFERENCE_PATHS].sort(),
    )
    expect(referencePaths(foundations).sort()).toEqual(
      [...FOUNDATION_REFERENCE_PATHS].sort(),
    )
  })

  it('keeps mandatory gate language out of the root skill', () => {
    const mandatoryPatterns = [
      /\bmandatory\b/iu,
      /\bmust\b/iu,
      /blocked until/iu,
      /Do not continue/iu,
      /hard (?:barrier|gate)/iu,
      /mutation lock/iu,
      /Required references/iu,
    ]

    for (const pattern of mandatoryPatterns) {
      expect(skill.instructions).not.toMatch(pattern)
    }
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
    expect(files).toHaveLength(16)
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
