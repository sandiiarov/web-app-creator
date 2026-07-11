import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { design } from './skill.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const SKILL_FILE = join(HERE, 'SKILL.md')
const REFERENCES_DIR = join(HERE, 'references')

const EXPECTED_REFERENCE_FILES = [
  'create.md',
  'iterate.md',
  'review.md',
] as const

type InlineSkillShape = {
  __inline?: true
  __referenceContents: Record<string, string>
  description: string
  instructions: string
  name: string
  references: string[]
}

describe('design skill loader', () => {
  const skill = design as InlineSkillShape

  it('parses non-empty skill metadata and instructions', () => {
    expect(skill.name).toBe('design')
    expect(skill.description.trim()).not.toBe('')
    expect(skill.instructions.trim()).not.toBe('')
  })

  it('loads exactly the contracted reference inventory from disk', () => {
    const files = readdirSync(REFERENCES_DIR)
      .filter((file) => file.endsWith('.md'))
      .sort()

    expect(files).toEqual(EXPECTED_REFERENCE_FILES)
    expect([...skill.references].sort()).toEqual(EXPECTED_REFERENCE_FILES)
  })

  it('loads every reference byte-for-byte, keyed by filename', () => {
    for (const file of EXPECTED_REFERENCE_FILES) {
      expect(skill.__referenceContents[file]).toBe(
        readFileSync(join(REFERENCES_DIR, file), 'utf8'),
      )
    }
  })

  it('returns a Mastra inline skill', () => {
    expect(skill.__inline).toBe(true)
  })

  it('keeps the SKILL.md source beside the loader', () => {
    expect(existsSync(SKILL_FILE)).toBe(true)
  })
})
