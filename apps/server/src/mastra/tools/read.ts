import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import {
  HASHLINE_PATH,
  HASHLINE_READ_GUIDANCE,
} from '../lib/hashline/edit-prompt.ts'
import { formatHashlineHeader } from '../lib/hashline/format.ts'
import type { Filesystem } from '../lib/hashline/fs.ts'
import { splitLines } from '../lib/hashline/shared.ts'
import type { SnapshotStore } from '../lib/hashline/snapshots.ts'

/**
 * Read the project HTML as a hashline section: a `[#TAG]` snapshot
 * header followed by `N:TEXT` rows. Records a content-hash snapshot so the
 * next `edit` can verify the tag (rejecting stale references). `offset`/`limit`
 * page through large documents.
 */
export function createReadTool(
  fs: Filesystem,
  snapshots: SnapshotStore,
  options: {
    /** Snapshot/filesystem key. Also the header path when `tagOnly` is false. */
    path?: string
    /** Emit `[#TAG]` headers (single-file) instead of `[path#TAG]`. */
    tagOnly?: boolean
  } = {},
) {
  const path = options.path ?? HASHLINE_PATH
  return createTool({
    description: HASHLINE_READ_GUIDANCE,
    execute: async ({ limit, offset }) => {
      const html = await fs.readText(path)
      const lines = splitLines(html)
      const startLine = offset ?? 1
      const endLine = limit
        ? Math.min(startLine + limit - 1, lines.length)
        : lines.length
      const visible = lines.slice(startLine - 1, endLine)
      const seenLines: number[] = []
      for (let n = startLine; n <= endLine; n += 1) seenLines.push(n)
      const tag = await snapshots.record(path, html, seenLines)
      const header = formatHashlineHeader(
        options.tagOnly ? undefined : path,
        tag,
      )
      const body = visible
        .map((text, index) => `${startLine + index}:${text}`)
        .join('\n')
      const truncated = endLine < lines.length
      const notice = truncated
        ? `\n[Showing lines ${startLine}-${endLine} of ${lines.length}; call read with offset=${endLine + 1} to continue]`
        : ''
      return {
        endLine,
        ok: true as const,
        startLine,
        tag,
        text: `${header}\n${body}${notice}`,
        totalLines: lines.length,
        truncated,
      }
    },
    id: 'read',
    inputSchema: z.object({
      action: z
        .string()
        .optional()
        .describe(
          "One short imperative line on what you are reading, shown to the user as this step's label.",
        ),
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Max lines to return (default: whole document).'),
      offset: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('1-based line to start reading from (default 1).'),
    }),
    outputSchema: z.object({
      endLine: z.number(),
      ok: z.literal(true),
      startLine: z.number(),
      tag: z.string(),
      text: z.string(),
      totalLines: z.number(),
      truncated: z.boolean(),
    }),
  })
}
