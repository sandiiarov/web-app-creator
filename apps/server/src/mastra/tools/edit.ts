import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import { ANCHOR_EDIT_GUIDANCE } from '../lib/anchor-edit/edit-prompt.ts'
import { HtmlStoreFilesystem } from '../lib/anchor-edit/html-store-filesystem.ts'
import { runAnchorEdit } from '../lib/anchor-edit/tool.ts'

/**
 * Edit the project HTML by anchor spans (v2 anchor-label engine — the single
 * version). Takes structured `edits`: each { start, end, content } replaces the
 * inclusive anchor span `start..end` with `content` (a multi-line string; empty
 * string deletes the span). Untouched lines keep their anchors; the response
 * returns a delta of the new `<anchor> <text>` lines so the model learns them.
 * Throws on an unknown (stale) anchor, reversed/overlapping spans, or an
 * unbalanced result that isn't a cleanly-truncated tail.
 */
export function createEditTool(fs: HtmlStoreFilesystem) {
  return createTool({
    description: ANCHOR_EDIT_GUIDANCE,
    execute: async ({ edits }) => {
      const out = runAnchorEdit(fs, edits ?? [])
      return {
        bytes: out.bytes,
        delta: out.delta,
        diffPreview: out.diffPreview,
        firstChangedLine: 0,
        header: '',
        ok: true as const,
        tag: out.tag,
        warnings: [...out.warnings],
      }
    },
    id: 'edit',
    inputSchema: z.object({
      action: z
        .string()
        .optional()
        .describe(
          "One short imperative line stating what this edit does, shown to the user as this step's label.",
        ),
      edits: z
        .array(
          z.object({
            content: z
              .string()
              .describe(
                'New lines replacing the start..end span (a multi-line string; one line per \\n). Empty string deletes the span.',
              ),
            end: z
              .string()
              .describe(
                'Anchor of the last line to replace (inclusive). Same as start for a single line.',
              ),
            start: z
              .string()
              .describe(
                'Anchor of the first line to replace (from read/find).',
              ),
          }),
        )
        .min(1)
        .describe(
          "One or more range-replaces. Batch a whole section's changes into one call; ranges must not overlap.",
        ),
    }),
    outputSchema: z.object({
      bytes: z.number(),
      delta: z.string().optional(),
      diffPreview: z.string(),
      firstChangedLine: z.number(),
      header: z.string(),
      ok: z.literal(true),
      tag: z.string(),
      warnings: z.array(z.string()),
    }),
  })
}
