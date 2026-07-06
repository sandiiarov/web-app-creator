import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import {
  applyAnchorEdits,
  type ApplyAnchorEdit,
} from '../lib/html-anchor-document.ts'
import type { HtmlStore } from '../lib/html-store.ts'

const anchorEditSchema = z.object({
  code: z
    .string()
    .optional()
    .describe(
      'HTML to write into the from/to region (replace) or at the insert point. Omit to delete the from/to region. Required for insert and for whole-document replace.',
    ),
  from: z
    .string()
    .optional()
    .describe(
      'Start anchor (inclusive). Omit for whole-document replace, or (with insert) for the document start/end boundary.',
    ),
  insert: z
    .enum(['after', 'before'])
    .optional()
    .describe(
      'Set to insert code instead of replacing: "before"/"after" the from anchor (or document start/end when from is omitted). Omit to replace or delete the from/to region.',
    ),
  intent: z
    .string()
    .describe(
      'Short reason for THIS edit, shown to the user, e.g. "swap hero headline to benefit-driven copy". Each edit in the batch has its own intent.',
    ),
  to: z
    .string()
    .optional()
    .describe(
      'End anchor (inclusive). Omit to target only the from line. Order-insensitive: from/to are resolved by document position, so reversed endpoints are fine.',
    ),
})

const editInputSchema = z.object({
  edits: z
    .array(anchorEditSchema)
    .min(1)
    .describe(
      'One or more edits. All from/to anchors resolve against the original document and apply atomically. Each edit carries its own intent so the user sees one reason per change.',
    ),
})

/**
 * Apply anchored line-range edits to the project HTML document. Batched edits
 * are resolved against the original anchored document, validated atomically,
 * and persisted through the project store on success. Each edit's `intent` is
 * surfaced to the UI as its own block. Returns concise metadata and a bounded
 * changed anchored region, never the full HTML.
 */
export function createEditTool(store: HtmlStore) {
  return createTool({
    description:
      'Edit the project HTML using anchors from read/find. Each edit is { intent, from?, to?, code?, insert? }. Discriminate by field presence: omit from/to and give code to replace the whole document (initial page); give from (and optional to) plus code to replace a region, or omit code to delete it; set insert to "before"/"after" to insert code relative to from (or the document start/end when from is omitted). from/to are order-insensitive (resolved by document position). Each edit carries its own intent shown to the user. Combine related non-overlapping edits in one call. The preview updates automatically after a successful edit. The result is concise metadata, not the full file.',
    execute: async ({ edits }) => {
      const result = applyAnchorEdits(store.getDocument(), toAnchorEdits(edits))
      const bytes = store.setDocument(result.document)
      const storedDocument = store.getDocument()
      return {
        bytes,
        changedLines: result.changedLines,
        changedText: result.changedText,
        checksum: storedDocument.checksum,
        edits: result.edits,
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
      edits: z.array(
        z.object({
          changedLines: z.number(),
          changedText: z.string(),
          firstChangedAnchor: z.string().optional(),
          intent: z.string(),
          lastChangedAnchor: z.string().optional(),
        }),
      ),
      firstChangedAnchor: z.string().optional(),
      firstChangedLine: z.number(),
      lastChangedAnchor: z.string().optional(),
      ok: z.literal(true),
      operations: z.number(),
    }),
  })
}

function toAnchorEdits(
  edits: z.infer<typeof editInputSchema>['edits'],
): ApplyAnchorEdit[] {
  return edits.map((edit) => ({ ...edit }))
}
