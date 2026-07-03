import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import {
  applyAnchorEdits,
  type AnchorRange,
  type ApplyAnchorEdit,
} from '../lib/html-anchor-document.ts'
import type { HtmlStore } from '../lib/html-store.ts'

const anchorRangeSchema = z
  .array(z.string())
  .max(2)
  .describe(
    'Anchor range: [], [anchor], or [startAnchor, endAnchor]. Ranges are inclusive.',
  )

const anchorEditSchema = z.object({
  operation: z
    .enum(['replace', 'delete', 'insert_before', 'insert_after'])
    .describe('Edit operation to apply to the anchor range'),
  range: anchorRangeSchema.describe(
    'Anchor range: [], [anchor], or [startAnchor, endAnchor]. Ranges are inclusive. [] means whole document for replace, document start for insert_before, and document end for insert_after.',
  ),
  text: z
    .string()
    .optional()
    .describe('Text for replace/insert operations. Omit for delete.'),
})

const editInputSchema = z.object({
  edits: z
    .array(anchorEditSchema)
    .min(1)
    .describe(
      'One or more anchor-range edits. All ranges resolve against the original document and apply atomically.',
    ),
  intent: z
    .string()
    .describe(
      'Short description of the change shown to the user, e.g. "swap hero headline to benefit-driven copy"',
    ),
})

/**
 * Apply anchored line-range edits to the project HTML document. Batched edits
 * are resolved against the original anchored document, validated atomically,
 * and persisted through the project store on success. `intent` is surfaced to
 * the UI. Returns concise metadata and a bounded changed anchored region,
 * never the full HTML.
 */
export function createEditTool(store: HtmlStore) {
  return createTool({
    description:
      'Edit the project HTML using anchor ranges from read/find. Use edits: [{ operation, range, text }]. Supported operations: replace, delete, insert_before, insert_after. Ranges are [], [anchor], or [startAnchor, endAnchor] and are inclusive; [] means whole document for replace, document start for insert_before, and document end for insert_after. Combine related non-overlapping changes in one call. The preview updates automatically after a successful edit. The result is concise metadata, not the full file. Always pass an intent describing the change.',
    execute: async ({ edits }) => {
      const result = applyAnchorEdits(store.getDocument(), toAnchorEdits(edits))
      const bytes = store.setDocument(result.document)
      const storedDocument = store.getDocument()
      return {
        bytes,
        changedLines: result.changedLines,
        changedText: result.changedText,
        checksum: storedDocument.checksum,
        firstChangedAnchor: result.firstChangedAnchor,
        firstChangedLine: result.firstChangedLine,
        lastChangedAnchor: result.lastChangedAnchor,
        ok: true as const,
        operations: result.operations,
      }
    },
    id: 'edit',
    inputSchema: editInputSchema,
    outputSchema: z.object({
      bytes: z.number(),
      changedLines: z.number(),
      changedText: z.string(),
      checksum: z.string(),
      firstChangedAnchor: z.string().optional(),
      firstChangedLine: z.number(),
      lastChangedAnchor: z.string().optional(),
      ok: z.literal(true),
      operations: z.number(),
    }),
  })
}

function toAnchorEdits(edits: z.infer<typeof editInputSchema>['edits']) {
  return edits.map(
    (edit): ApplyAnchorEdit => ({
      ...edit,
      range: edit.range as AnchorRange,
    }),
  )
}
