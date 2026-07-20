import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import { ANCHOR_FIND_GUIDANCE } from '../lib/anchor-edit/edit-prompt.ts'
import { HtmlStoreFilesystem } from '../lib/anchor-edit/html-store-filesystem.ts'

/**
 * Find text in the project HTML and return the matching lines (with optional
 * context) as `<anchor> <text>` labeled lines (v2 anchor-label engine). Anchors
 * are stable, so the model can edit the matched lines directly.
 */
export function createFindTool(fs: HtmlStoreFilesystem) {
  return createTool({
    description: ANCHOR_FIND_GUIDANCE,
    execute: async ({ context, ignoreCase, limit, regex, text: query }) => {
      const doc = fs.getDocument()
      const lines = doc.lines
      const flags = ignoreCase ? 'i' : ''
      const pattern = regex
        ? new RegExp(query, flags)
        : new RegExp(escapeRegex(query), flags)
      const matchIdx: number[] = []
      for (let i = 0; i < lines.length; i += 1) {
        if (pattern.test(lines[i]![1])) matchIdx.push(i)
      }
      const maxMatches = limit ?? 100
      const matchLimitReached = matchIdx.length > maxMatches
      const ctx = context ?? 0
      const display = new Set<number>()
      for (const m of matchIdx.slice(0, maxMatches)) {
        for (let c = m - ctx; c <= m + ctx; c += 1) {
          if (c >= 0 && c < lines.length) display.add(c)
        }
      }
      const sortedDisplay = [...display].sort((a, b) => a - b)
      const gen =
        doc.checksum && doc.checksum !== 'sha256:'
          ? doc.checksum.slice('sha256:'.length).slice(0, 4).toUpperCase()
          : ''
      const head = gen ? `@${gen}\n` : ''
      const body =
        matchIdx.length === 0
          ? `[no matches for "${query}"]`
          : sortedDisplay
              .map((i) => `${lines[i]![0]} ${lines[i]![1]}`)
              .join('\n')
      return {
        matchCount: matchIdx.length,
        matchLimitReached,
        ok: true as const,
        returnedLines: sortedDisplay.length,
        tag: gen,
        text: `${head}${body}`,
        totalLines: lines.length,
      }
    },
    id: 'find',
    inputSchema: z.object({
      action: z
        .string()
        .optional()
        .describe(
          "One short imperative line on what you are searching for, shown to the user as this step's label.",
        ),
      context: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe('Lines of context before/after each match (default 0).'),
      ignoreCase: z
        .boolean()
        .optional()
        .describe('Case-insensitive search (default false).'),
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Max matches to return (default 100).'),
      regex: z
        .boolean()
        .optional()
        .describe('Treat text as a regex (default false: literal search).'),
      text: z.string().describe('Literal text or regex pattern to find.'),
    }),
    outputSchema: z.object({
      matchCount: z.number(),
      matchLimitReached: z.boolean(),
      ok: z.literal(true),
      returnedLines: z.number(),
      tag: z.string(),
      text: z.string(),
      totalLines: z.number(),
    }),
  })
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
