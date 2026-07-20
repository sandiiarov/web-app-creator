import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import { ANCHOR_READ_GUIDANCE } from '../lib/anchor-edit/edit-prompt.ts'
import { HtmlStoreFilesystem } from '../lib/anchor-edit/html-store-filesystem.ts'
import { runAnchorRead } from '../lib/anchor-edit/tool.ts'

/**
 * Read the whole project HTML as `<anchor> <text>` labeled lines (v2
 * anchor-label engine — the single version). Anchors are stable, so the model
 * reuses them across edits and rarely needs to re-read.
 */
export function createReadTool(fs: HtmlStoreFilesystem) {
  return createTool({
    description: ANCHOR_READ_GUIDANCE,
    execute: async () => {
      const out = runAnchorRead(fs)
      return {
        endLine: out.totalLines,
        lines: out.lines,
        ok: true as const,
        ranges: [],
        startLine: 1,
        tag: out.tag,
        text: out.text,
        totalLines: out.totalLines,
        truncated: false,
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
