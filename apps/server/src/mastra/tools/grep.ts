import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import { grepHtml } from '../lib/grep-search.ts'
import type { HtmlStore } from '../lib/html-store.ts'

/**
 * Search `/index.html` for a pattern. Regex by default; `literal` for plain
 * strings. Returns matching lines with line numbers and optional context.
 * `action` is surfaced to the UI.
 */
export function createGrepTool(store: HtmlStore) {
  return createTool({
    description:
      'Search /index.html for a pattern. Regex by default; set literal=true for plain strings. Returns numbered text plus raw unnumbered matches. Use rawMatches/read rawText for edit.oldText; do not copy line numbers into edits. Always pass an action: one short imperative line on what you are searching for (shown to the user as the label for this step).',
    execute: async ({ context, ignoreCase, limit, literal, pattern }) => {
      const result = grepHtml(store.get(), pattern, {
        context,
        ignoreCase,
        limit,
        literal,
      })
      return {
        matchCount: result.matchCount,
        matchLimitReached: result.matchLimitReached,
        rawMatches: result.matches,
        text: `Use rawMatches/read rawText for edit.oldText; numbered text is only for navigation.\n\n${result.output}`,
        truncatedLines: result.truncatedLines,
      }
    },
    id: 'grep',
    inputSchema: z.object({
      action: z
        .string()
        .describe(
          'Short reason for searching (shown to the user), e.g. "locate the CTA button markup"',
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
        .describe('Case-insensitive (default false)'),
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Max matches to return (default 100)'),
      literal: z
        .boolean()
        .optional()
        .describe(
          'Treat pattern as a literal string, not regex (default false)',
        ),
      pattern: z.string().describe('Search pattern (regex by default)'),
    }),
    outputSchema: z.object({
      matchCount: z.number(),
      matchLimitReached: z.boolean(),
      rawMatches: z.array(
        z.object({ lineNumber: z.number(), text: z.string() }),
      ),
      text: z.string(),
      truncatedLines: z.boolean(),
    }),
  })
}
