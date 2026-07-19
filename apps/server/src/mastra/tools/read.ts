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
 * Read the project HTML as a hashline section: a `[#TAG]` snapshot header
 * followed by `N:TEXT` rows. Records a content-hash snapshot so the next
 * `edit` can verify the tag (rejecting stale references). `offset`/`limit`
 * page through large documents. Pass `ranges` to read several disjoint regions
 * (e.g. a `<style>` block and a `<body>` block) in one call under a single
 * fresh tag — do this before an edit whose anchors span multiple regions.
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
    execute: async ({ limit, offset, ranges }) => {
      const html = await fs.readText(path)
      const lines = splitLines(html)
      const totalLines = lines.length

      // `ranges` overrides offset/limit; default to a single whole-file range.
      const requested: Array<{ limit?: number; offset: number }> =
        ranges && ranges.length > 0
          ? ranges.map((r) => ({ limit: r.limit, offset: r.offset }))
          : [{ limit, offset: offset ?? 1 }]
      const singleRange = requested.length === 1

      const seen = new Set<number>()
      const sections: string[] = []
      const rangeMeta: Array<{
        endLine: number
        startLine: number
        truncated: boolean
      }> = []
      let displayed = 0

      for (const r of requested) {
        const startLine = r.offset
        const endLine = r.limit
          ? Math.min(startLine + r.limit - 1, totalLines)
          : totalLines
        const visible = lines.slice(startLine - 1, endLine)
        for (let n = startLine; n <= endLine; n += 1) seen.add(n)
        displayed += visible.length
        const body = visible
          .map((text, index) => `${startLine + index}:${text}`)
          .join('\n')
        sections.push(body)
        const truncated = endLine < totalLines
        rangeMeta.push({ endLine, startLine, truncated })
        // The continue notice is a paging aid for single-range reads; a
        // targeted multi-range read deliberately picks each window, so stay
        // quiet (the `ranges` metadata still flags per-range truncation).
        if (truncated && singleRange) {
          sections.push(
            `[Showing lines ${startLine}-${endLine} of ${totalLines}; call read with offset=${endLine + 1} to continue]`,
          )
        }
      }

      // record() merges these lines into any existing same-hash snapshot, so a
      // narrow read never erases lines shown by an earlier read of the same
      // file state — every range read at this hash accumulates into one tag.
      const tag = await snapshots.record(path, html, seen)
      const header = formatHashlineHeader(
        options.tagOnly ? undefined : path,
        tag,
      )
      return {
        endLine: rangeMeta[rangeMeta.length - 1]?.endLine ?? 0,
        lines: displayed,
        ok: true as const,
        ranges: rangeMeta,
        startLine: rangeMeta[0]?.startLine ?? 0,
        tag,
        text: `${header}\n${sections.join('\n')}`,
        totalLines,
        truncated: rangeMeta.some((r) => r.truncated),
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
        .describe(
          'Max lines to return for a single-range read (default: to end of file). Ignored when `ranges` is set.',
        ),
      offset: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          '1-based line to start reading from for a single-range read (default 1). Ignored when `ranges` is set.',
        ),
      ranges: z
        .array(
          z.object({
            limit: z
              .number()
              .int()
              .positive()
              .optional()
              .describe('Max lines for this range (default: to end of file).'),
            offset: z
              .number()
              .int()
              .positive()
              .describe('1-based line to start this range at.'),
          }),
        )
        .optional()
        .describe(
          'Read several disjoint regions in ONE call under a single fresh tag — e.g. a <style> region and a <body> region — before an edit whose SWAP/DEL/INS anchors span multiple regions. Each entry is { offset, limit? }. Overrides offset/limit.',
        ),
    }),
    outputSchema: z.object({
      endLine: z.number(),
      lines: z.number(),
      ok: z.literal(true),
      ranges: z.array(
        z.object({
          endLine: z.number(),
          startLine: z.number(),
          truncated: z.boolean(),
        }),
      ),
      startLine: z.number(),
      tag: z.string(),
      text: z.string(),
      totalLines: z.number(),
      truncated: z.boolean(),
    }),
  })
}
