import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import type { HtmlStore } from '../lib/html-store.ts'

/**
 * Read lines of `/index.html` as a numbered listing (1-indexed).
 * `offset` is the first line (default 1); `limit` caps the line count
 * (default 2000). `intent` is surfaced to the UI as the reason for the read.
 */
export function createReadTool(store: HtmlStore) {
  return createTool({
    description:
      'Read the current /index.html. Returns rawText (copy this into edit.oldText/edits[].oldText) plus numberedText for navigation. Use offset/limit to page through a long file. Always pass an intent describing why you are reading.',
    execute: async ({ limit, offset }) => {
      const lines = store
        .get()
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
      const start = Math.max(1, offset ?? 1)
      const end = Math.min(lines.length, start - 1 + (limit ?? 2000))
      const slice = lines.slice(start - 1, end)
      const width = String(end).length
      const text = slice
        .map((line, i) => `${String(start + i).padStart(width, ' ')}  ${line}`)
        .join('\n')
      const rawText = slice.join('\n')
      return {
        lines: end - start + 1,
        numberedText: `${text}\n\n(showing lines ${start}-${end} of ${lines.length})`,
        rawText,
        text: `Use rawText for edit.oldText; numberedText is only for navigation.\n\nrawText:\n${rawText}\n\nnumberedText:\n${text}\n\n(showing lines ${start}-${end} of ${lines.length})`,
        totalLines: lines.length,
      }
    },
    id: 'read',
    inputSchema: z.object({
      intent: z
        .string()
        .describe(
          'Short reason for reading (shown to the user), e.g. "review current hero markup"',
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
    }),
    outputSchema: z.object({
      lines: z.number(),
      numberedText: z.string(),
      rawText: z.string(),
      text: z.string(),
      totalLines: z.number(),
    }),
  })
}
