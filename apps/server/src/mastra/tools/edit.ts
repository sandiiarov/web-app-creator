import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import { applyEdits, countChangedLines, type Edit } from '../lib/edit-diff.ts'
import type { HtmlStore } from '../lib/html-store.ts'

const editReplacementSchema = z.object({
  newText: z.string().describe('Replacement text for this targeted edit'),
  oldText: z
    .string()
    .describe('Exact text to find, including whitespace and newlines'),
})

const editInputSchema = z.object({
  edits: z
    .union([z.array(editReplacementSchema).min(1), z.string()])
    .optional()
    .describe(
      'Preferred: one or more targeted replacements. Each oldText is matched against the original file, not incrementally.',
    ),
  intent: z
    .string()
    .describe(
      'Short description of the change shown to the user, e.g. "swap hero headline to benefit-driven copy"',
    ),
  newText: z
    .string()
    .optional()
    .describe('Legacy single-edit replacement text. Prefer edits[].newText.'),
  oldText: z
    .string()
    .optional()
    .describe('Legacy single-edit target text. Prefer edits[].oldText.'),
  path: z
    .string()
    .optional()
    .describe('Optional; the only editable file is /index.html.'),
})

type EditInput = z.infer<typeof editInputSchema>

/**
 * Apply exact-text replacements to `/index.html`. Batched edits are matched
 * against the original document, must be unique and
 * non-overlapping, and fuzzy matching tolerates trailing whitespace, smart
 * quotes/dashes, special spaces, BOMs, and line endings. `intent` is surfaced
 * to the UI; on success the project file has already been written.
 */
export function createEditTool(store: HtmlStore) {
  return createTool({
    description:
      'Edit /index.html using exact text replacement. Prefer edits: [{ oldText, newText }] and combine related non-overlapping replacements in one call. Each oldText must be unique in the original document and include exact whitespace/newlines. Use grep/read first to get exact text. The preview updates automatically after a successful edit. Always pass an intent describing the change.',
    execute: async (input) => {
      const edits = prepareEdits(input)
      const before = store.get()
      const after = applyEdits(before, edits)
      const bytes = store.set(after)
      const changedLines = countChangedLines(before, after)
      return {
        bytes,
        changedLines,
        html: store.get(),
        ok: true,
        replacements: edits.length,
      }
    },
    id: 'edit',
    inputSchema: editInputSchema,
    outputSchema: z.object({
      bytes: z.number(),
      changedLines: z.number(),
      html: z.string(),
      ok: z.boolean(),
      replacements: z.number(),
    }),
  })
}

function parseEdits(value: EditInput['edits']): Edit[] {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value) as unknown
    if (
      Array.isArray(parsed) &&
      parsed.every(
        (edit) =>
          !!edit &&
          typeof edit === 'object' &&
          typeof (edit as Record<string, unknown>).oldText === 'string' &&
          typeof (edit as Record<string, unknown>).newText === 'string',
      )
    ) {
      return parsed as Edit[]
    }
  } catch {
    // Some models stringify edits; invalid JSON falls through to the schema error.
  }
  throw new Error(
    'Edit tool input is invalid. edits must be an array of { oldText, newText }.',
  )
}

function prepareEdits(input: EditInput): Edit[] {
  const path = input.path?.replace(/^\.\//, '')
  if (path && path !== '/index.html' && path !== 'index.html') {
    throw new Error('Edit can only modify /index.html.')
  }

  const parsedEdits = parseEdits(input.edits)
  const legacyEdit =
    typeof input.oldText === 'string' && typeof input.newText === 'string'
      ? [{ newText: input.newText, oldText: input.oldText }]
      : []
  const edits = [...parsedEdits, ...legacyEdit]
  if (edits.length === 0) {
    throw new Error(
      'Edit tool input is invalid. edits must contain at least one replacement.',
    )
  }
  return edits
}
