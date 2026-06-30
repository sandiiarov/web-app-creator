import { readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

import { createSkill } from '@mastra/core/skills'

/**
 * Design skill, inlined from the pi design skill (`~/.pi/agent/skills/design`).
 *
 * `instructions` adapts the design philosophy to the landing-page agent's job
 * (build/refine a single self-contained `/index.html` via read/edit/grep).
 * `references` bundles all 25 design reference docs so the agent can load the
 * detailed rules on demand via the auto-added `skill_read` / `skill_search`
 * tools — instead of stuffing ~50K tokens into every prompt.
 */

function loadReferenceMap(root: string): Record<string, string> {
  const dir = join(root, 'references')
  const map: Record<string, string> = {}
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith('.md'))
    for (const file of files) {
      map[file] = readFileSync(join(dir, file), 'utf8')
    }
  } catch {
    // references unavailable — skill still works with just instructions
  }
  return map
}

function loadSkillInstructions(root: string): string {
  try {
    return readFileSync(join(root, 'SKILL.md'), 'utf8')
  } catch {
    return ''
  }
}

function resolveDesignRoot(): string {
  const home = homedir()
  const candidates = [
    resolve(home, '.pi/agent/skills/design'),
    resolve(process.cwd(), '.pi/skills/design'),
  ]
  for (const candidate of candidates) {
    try {
      readFileSync(join(candidate, 'SKILL.md'))
      return candidate
    } catch {
      // try next
    }
  }
  return candidates[0]!
}

const DESIGN_ROOT = resolveDesignRoot()
const DESIGN_REFERENCES = loadReferenceMap(DESIGN_ROOT)
const PI_SKILL_BODY = loadSkillInstructions(DESIGN_ROOT)

export const designSkill = createSkill({
  description:
    'Use for every landing-page design decision: building a new page from a prompt, refining layout, color, typography, spacing, motion, voice, responsive behavior, or auditing an existing page. Load the relevant reference before making changes.',
  instructions: [
    '# Landing-page design agent',
    '',
    'You build and refine a single self-contained file: `/index.html`. Every change is an edit to that one file. The file is the only artifact and the only thing the user ever sees.',
    '',
    '## How a turn runs',
    '1. Understand the request. If it is a new page, read the `create` reference first and build from scratch (a sequence of edits starting from the placeholder). If it refines an existing page, `grep`/`read` the current file to find the exact text, then `edit`.',
    '2. Decide — do not ask for confirmation on a complete prompt. Infer ordinary details and choose the strongest interpretation. Ask only if a truly ambiguous goal would change what gets built.',
    '3. Ship — apply edits to real markup. No markdown mockups, no describing what you would do. Every turn must leave `/index.html` better than it found it.',
    '',
    '## Design taste (apply always)',
    'These rules are non-negotiable. Load the full reference for any area before working in it.',
    '- **Color**: intentional, accessible palette; never default blue/purple gradients or generic AI rainbow. Define tokens, use them consistently.',
    '- **Typography**: a deliberate type scale; real hierarchy via size/weight, not decoration. Avoid Inter/Geist defaults unless intentional.',
    '- **Layout**: composition follows the work, never habit. Generous whitespace, clear visual rhythm, strong alignment.',
    '- **Spacing**: consistent scale; breathing room; no cramped clusters.',
    '- **Motion**: none unless it earns its place. Default to static. No fade-ins, scale-on-hover, or count-ups without a reason.',
    '- **Voice**: clear, specific, human copy. Cut adjectives and buzzwords. No "powerful", "seamless", "leverage".',
    '- **Responsive**: works from mobile up; test breakpoints; never horizontally scroll on a phone.',
    '- **Surfaces**: restrained borders and shadows; flat by default; depth only where it communicates hierarchy.',
    '- **No rounded corners**: use `border-radius: 0` (or tailwind `rounded-none`). Sharp, architectural corners only.',
    '',
    '## Anti-patterns (never ship these)',
    '- AI-generated smell: generic gradient heroes, glassmorphism, aurora blobs, centered-trio layouts, emoji feature icons, "trusted by" logo strips, 3-card feature grids with outline icons.',
    '- Decoration without purpose: gradients, glows, drop shadows, borders added "to look nice".',
    '- Inconsistent tokens: ad-hoc hex values, mixed spacing units, mismatched corner radii.',
    '- Bloated copy: marketing adjective soup, vague headlines, placeholder Lorem.',
    '',
    '## Tool usage',
    '- `grep` — find exact text/structure before editing. Always grep first so oldText is unique and exact.',
    '- `read` — inspect a region of the file when you need surrounding context or line numbers.',
    '- `edit` — apply a change. oldText must match exactly (whitespace + newlines) and be unique. Pass a clear `intent` for every call — it is shown to the user.',
    '',
    '## Before you finish',
    'Re-read the file once. Confirm: no rounded corners, no unearned motion, real copy (no Lorem), consistent tokens, responsive, accessible contrast. If any anti-pattern remains, fix it before stopping.',
    '',
    '---',
    '',
    '## Full pi design skill (reference)',
    'Below is the complete pi design skill body. Treat it as authoritative design guidance; ignore the parts about CLI commands (`/design ...`), `.commandcode/design/` reports, and tools that do not exist here (recolor, relayout as separate tools — fold them into `edit`). The design taste, references, and checklists are directly applicable.',
    '',
    PI_SKILL_BODY,
  ].join('\n'),
  name: 'design',
  references: DESIGN_REFERENCES,
})
