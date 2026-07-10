import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { design } from './skill.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const SKILL_FILE = join(HERE, 'SKILL.md')
const REFERENCES_DIR = join(HERE, 'references')

type InlineSkillShape = {
  __inline?: true
  __referenceContents: Record<string, string>
  description: string
  instructions: string
  name: string
  references: string[]
}

describe('design skill', () => {
  const skill = design as InlineSkillShape

  it('parses the landing-page SKILL.md metadata and concise control plane', () => {
    expect(skill.name).toBe('design')
    expect(skill.description).toMatch(/Creates, edits, reviews, and redesigns/iu)
    expect(skill.description).toMatch(/Required references must be read/iu)
    expect(skill.instructions.trim()).toMatch(/^# Design/u)
    expect(skill.instructions.length).toBeGreaterThanOrEqual(4_000)
    expect(skill.instructions.length).toBeLessThanOrEqual(15_000)
  })

  it('requires complete reference reads before mutation without activating supporting modes', () => {
    expect(skill.instructions).toMatch(
      /Before the first `edit` or `generate_image`/u,
    )
    expect(skill.instructions).toMatch(/Omit `startLine` and `endLine`/u)
    expect(skill.instructions).toMatch(/every required read succeeded/u)
    expect(skill.instructions).toMatch(
      /supporting reference informs the active mode; it does not activate/iu,
    )
    expect(skill.instructions).toMatch(/### Full page creation/u)
    expect(skill.instructions).toMatch(/### Full page redesign/u)
    expect(skill.instructions).toMatch(/`references\/create\.md`/u)
    expect(skill.instructions).toMatch(/`references\/redesign\.md`/u)
    expect(skill.instructions).toMatch(/exact one-element or one-viewport/iu)
  })

  it('lists every reference file from disk as the reference paths', () => {
    const files = readdirSync(REFERENCES_DIR)
      .filter((file) => file.endsWith('.md'))
      .sort()

    expect([...skill.references].sort()).toEqual(files)
  })

  it('loads every reference content from disk, keyed by filename', () => {
    const files = readdirSync(REFERENCES_DIR).filter((file) =>
      file.endsWith('.md'),
    )
    for (const file of files) {
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
