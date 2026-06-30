import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import { grepHtml } from '../lib/grep-search.ts'
import type { HtmlStore } from '../lib/html-store.ts'

/**
 * Search `/index.html` for a pattern. Regex by default; `literal` for plain
 * strings. Returns matching lines with line numbers and optional context.
 * `intent` is surfaced to the UI.
 */
export function createGrepTool(store: HtmlStore) {
  return createTool({
    description:
      'Search /index.html for a pattern. Regex by default; set literal=true for plain strings. Returns matching lines with 1-indexed line numbers and optional context lines. Use this to find exact text before editing. Always pass an intent describing the search.',
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
        text: result.output,
        truncatedLines: result.truncatedLines,
      }
    },
    id: 'grep',
    inputSchema: z.object({
      context: z.number().int().nonnegative().optional().describe('Lines of context before/after each match (default 0)'),
      ignoreCase: z.boolean().optional().describe('Case-insensitive (default false)'),
      intent: z
        .string()
        .describe('Short reason for searching (shown to the user), e.g. "locate the CTA button markup"'),
      limit: z.number().int().positive().optional().describe('Max matches to return (default 100)'),
      literal: z.boolean().optional().describe('Treat pattern as a literal string, not regex (default false)'),
      pattern: z.string().describe('Search pattern (regex by default)'),
    }),
    outputSchema: z.object({
      matchCount: z.number(),
      matchLimitReached: z.boolean(),
      text: z.string(),
      truncatedLines: z.boolean(),
    }),
  })
}
