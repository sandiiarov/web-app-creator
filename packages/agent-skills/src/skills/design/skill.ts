import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createSkill } from '@mastra/core/skills'

const HERE = dirname(fileURLToPath(import.meta.url))
const SKILL_FILE = join(HERE, 'SKILL.md')
const REFERENCES_DIR = join(HERE, 'references')

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

interface ParsedSkillFile {
  description: string
  instructions: string
  name: string
}

function readFrontmatterField(
  frontmatter: string,
  key: string,
): string | undefined {
  const pattern = new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'mu')
  const value = frontmatter.match(pattern)?.[1]
  return value === undefined ? undefined : unquote(value)
}

/** Read every `references/*.md` from disk, keyed by filename (served in-memory by `skill_read`). */
function readReferences(): Record<string, string> {
  const files = readdirSync(REFERENCES_DIR)
    .filter((file) => file.endsWith('.md'))
    .sort()
  const references: Record<string, string> = {}
  for (const file of files) {
    references[file] = readFileSync(join(REFERENCES_DIR, file), 'utf8')
  }
  return references
}

/** Parse the YAML frontmatter fence for `name`/`description`; body becomes `instructions`. */
function readSkillFile(): ParsedSkillFile {
  const raw = readFileSync(SKILL_FILE, 'utf8')
  const match = raw.match(FRONTMATTER_PATTERN)
  if (!match) {
    return { description: '', instructions: raw, name: 'design' }
  }
  const frontmatter = match[1] ?? ''
  const body = match[2] ?? ''
  return {
    description: readFrontmatterField(frontmatter, 'description') ?? '',
    instructions: body,
    name: readFrontmatterField(frontmatter, 'name') ?? 'design',
  }
}

function unquote(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

const { description, instructions, name } = readSkillFile()
const references = readReferences()

/**
 * The verbatim pi `design` skill: `SKILL.md` + `references/*.md` loaded from
 * disk (not inlined) and built into a Mastra `InlineSkill` via `createSkill`.
 * Attach directly to an Agent's `skills` config.
 */
export const design = createSkill({
  description,
  instructions,
  name,
  references,
})
