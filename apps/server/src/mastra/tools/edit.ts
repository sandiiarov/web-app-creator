import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import { applyEdit, countChangedLines } from '../lib/edit-diff.ts'
import type { HtmlStore } from '../lib/html-store.ts'

/**
 * Apply one exact-text replacement to `/index.html`. Fuzzy-matches if the
 * exact string isn't found (trailing whitespace, smart quotes/dashes). Throws
 * if oldText is absent, not unique, overlaps another edit, or is a no-op.
 * `intent` is surfaced to the UI; on success the route emits the full HTML.
 */
export function createEditTool(store: HtmlStore) {
  return createTool({
    description:
      'Edit /index.html by replacing oldText with newText. oldText must match exactly (whitespace + newlines) and be unique. Use grep/read first to get exact text. After a successful edit the preview is updated automatically. Always pass an intent describing the change.',
    execute: async ({ newText, oldText }) => {
      const before = store.get()
      const after = applyEdit(before, oldText, newText)
      const bytes = store.set(after)
      const changedLines = countChangedLines(before, after)
      return {
        bytes,
        changedLines,
        html: after,
        ok: true,
      }
    },
    id: 'edit',
    inputSchema: z.object({
      intent: z
        .string()
        .describe('Short description of the change (shown to the user), e.g. "swap hero headline to benefit-driven copy"'),
      newText: z.string().describe('Replacement text'),
      oldText: z.string().describe('Exact text to find, including whitespace and newlines'),
    }),
    outputSchema: z.object({
      bytes: z.number(),
      changedLines: z.number(),
      html: z.string(),
      ok: z.boolean(),
    }),
  })
}
