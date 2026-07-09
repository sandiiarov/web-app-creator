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

  it('parses the landing-page SKILL.md metadata and body', () => {
    expect(skill.name).toBe('design')
    expect(skill.description).toMatch(/Design partner for landing pages/u)
    expect(skill.instructions.trim()).toMatch(/^# Design/u)
    expect(skill.instructions.length).toBeGreaterThan(10_000)
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
