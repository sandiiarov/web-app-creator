import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import { findHtmlDocumentLines } from '../lib/html-anchor-document.ts'
import type { HtmlStore } from '../lib/html-store.ts'

/**
 * Find lines in the project HTML and return compact anchored text
 * (`anchor|text`) with optional context.
 */
export function createFindTool(store: HtmlStore) {
  return createTool({
    description:
      'Find text in the current project HTML. Literal substring search is the default; set regex=true for regular expressions. Returns compact anchor|text lines with optional context. Use returned anchors in edit ranges. Always pass an action: one short imperative line on what you are searching for (shown to the user as the label for this step).',
    execute: async ({ context, ignoreCase, limit, regex, text }) => {
      const result = findHtmlDocumentLines(store.getDocument(), {
        context,
        ignoreCase,
        limit,
        regex,
        text,
      })
      return { ok: result.error ? false : true, ...result }
    },
    id: 'find',
    inputSchema: z.object({
      action: z
        .string()
        .optional()
        .describe(
          'One short imperative line stating what you are searching for, shown to the user as this step\'s label (think commit message), e.g. "locate the CTA button anchors"',
        ),
      context: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe('Lines of context before/after each match (default 0)'),
      ignoreCase: z
        .boolean()
        .optional()
        .describe('Case-insensitive search (default false)'),
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Max matches to return (default 100)'),
      regex: z
        .boolean()
        .optional()
        .describe('Treat text as a regex (default false: literal search)'),
      text: z.string().describe('Literal text or regex pattern to find'),
    }),
    outputSchema: z.object({
      checksum: z.string(),
      error: z.string().optional(),
      matchCount: z.number(),
      matchLimitReached: z.boolean(),
      ok: z.boolean(),
      returnedLines: z.number(),
      text: z.string(),
      totalLines: z.number(),
      truncatedLines: z.boolean(),
    }),
  })
}
