import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import {
  HASHLINE_FIND_GUIDANCE,
  HASHLINE_PATH,
} from '../lib/hashline/edit-prompt.ts'
import { formatHashlineHeader } from '../lib/hashline/format.ts'
import type { Filesystem } from '../lib/hashline/fs.ts'
import { splitLines } from '../lib/hashline/shared.ts'
import type { SnapshotStore } from '../lib/hashline/snapshots.ts'

/**
 * Find text in the project HTML and return a hashline section
 * (`[index.html#TAG]` + `N:TEXT` rows) for the matches with optional context.
 * Records a snapshot covering the displayed lines so the next edit can verify
 * the tag.
 */
export function createFindTool(
  fs: Filesystem,
  snapshots: SnapshotStore,
  path: string = HASHLINE_PATH,
) {
  return createTool({
    description: HASHLINE_FIND_GUIDANCE,
    execute: async ({ context, ignoreCase, limit, regex, text: query }) => {
      const html = await fs.readText(path)
      const lines = splitLines(html)
      const flags = ignoreCase ? 'i' : ''
      const pattern = regex
        ? new RegExp(query, flags)
        : new RegExp(escapeRegex(query), flags)
      const matchLines: number[] = []
      for (let i = 0; i < lines.length; i += 1) {
        if (pattern.test(lines[i]!)) matchLines.push(i + 1)
      }
      const maxMatches = limit ?? 100
      const matchLimitReached = matchLines.length > maxMatches
      const ctx = context ?? 0
      const display = new Set<number>()
      for (const m of matchLines.slice(0, maxMatches)) {
        for (let c = m - ctx; c <= m + ctx; c += 1) {
          if (c >= 1 && c <= lines.length) display.add(c)
        }
      }
      const sortedDisplay = [...display].sort((a, b) => a - b)
      const tag = await snapshots.record(path, html, sortedDisplay)
      const header = formatHashlineHeader(path, tag)
      const body =
        matchLines.length === 0
          ? `[no matches for "${query}"]`
          : sortedDisplay.map((n) => `${n}:${lines[n - 1]}`).join('\n')
      return {
        matchCount: matchLines.length,
        matchLimitReached,
        ok: true as const,
        returnedLines: sortedDisplay.length,
        tag,
        text: `${header}\n${body}`,
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
