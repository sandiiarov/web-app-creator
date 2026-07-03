import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import { readHtmlDocumentLines } from '../lib/html-anchor-document.ts'
import type { HtmlStore } from '../lib/html-store.ts'

const anchorRangeSchema = z.union([
  z.tuple([]),
  z.tuple([z.string(), z.string()]),
  z.tuple([z.string()]),
])

/**
 * Read lines of the project HTML as compact anchored text (`anchor|text`).
 * `offset` is the first line (default 1); `limit` caps the line count
 * (default 2000). `range` targets anchors and is mutually exclusive with
 * `offset`. `intent` is surfaced to the UI as the reason for the read.
 */
export function createReadTool(store: HtmlStore) {
  return createTool({
    description:
      'Read the current project HTML as compact anchored lines in the form anchor|text. Use returned anchors in edit ranges; do not copy raw HTML snippets. Use offset/limit or range to inspect a focused section. Always pass an intent describing why you are reading.',
    execute: async ({ limit, offset, range }) => {
      const result = readHtmlDocumentLines(store.getDocument(), {
        limit,
        offset,
        range,
      })
      return { ...result, ok: true as const }
    },
    id: 'read',
    inputSchema: z.object({
      intent: z
        .string()
        .describe(
          'Short reason for reading (shown to the user), e.g. "review current hero markup anchors"',
        ),
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Max lines to return (default 2000)'),
      offset: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('First line number to return, 1-indexed (default 1)'),
      range: anchorRangeSchema
        .optional()
        .describe(
          'Anchor range to read: [], [anchor], or [startAnchor, endAnchor]. Mutually exclusive with offset.',
        ),
    }),
    outputSchema: z.object({
      checksum: z.string(),
      endAnchor: z.string().optional(),
      lines: z.number(),
      ok: z.literal(true),
      startAnchor: z.string().optional(),
      text: z.string(),
      totalLines: z.number(),
      truncatedLines: z.boolean(),
    }),
  })
}
