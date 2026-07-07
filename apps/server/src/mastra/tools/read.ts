import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import { readHtmlDocumentLines } from '../lib/html-anchor-document.ts'
import type { HtmlStore } from '../lib/html-store.ts'

/**
 * Read lines of the project HTML as compact anchored text (`anchor|text`).
 * `from`/`to` select an inclusive anchor region (order-insensitive); omit
 * both to read from the start. `limit` caps the line count (default 2000).
 * `intent` is surfaced to the UI as the reason for the read.
 */
export function createReadTool(store: HtmlStore) {
  return createTool({
    description:
      'Read the current project HTML as compact anchored lines in the form anchor|text. Use the returned anchors in edit from/to; do not copy raw HTML snippets. Omit from/to to read from the start; set from (and optional to) to read a region (order-insensitive). limit caps the line count. Always pass an intent describing why you are reading.',
    execute: async ({ from, limit, to }) => {
      const result = readHtmlDocumentLines(store.getDocument(), {
        from,
        limit,
        to,
      })
      return { ...result, ok: true as const }
    },
    id: 'read',
    inputSchema: z.object({
      from: z
        .string()
        .optional()
        .describe(
          'Start of the region (inclusive): a real anchor from read/find, or "start" for the document beginning. Omit to read from the start.',
        ),
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
      to: z
        .string()
        .optional()
        .describe(
          'End of the region (inclusive): a real anchor from read/find, or "end" for the document end. Omit to read only the from line. Order-insensitive.',
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
