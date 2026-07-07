import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import {
  applyAnchorEdits,
  type ApplyAnchorEdit,
} from '../lib/html-anchor-document.ts'
import type { HtmlStore } from '../lib/html-store.ts'

const anchorEditSchema = z.object({
  action: z
    .string()
    .optional()
    .describe(
      'One short imperative line stating what THIS edit does, shown to the user as its label (think commit message), e.g. "swap hero headline to benefit-driven copy". Each edit in the batch has its own action.',
    ),
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
      'Start of the region (inclusive): a real anchor from read/find, or "start" for the document beginning. Omit (with code) for whole-document replace.',
    ),
  insert: z
    .enum(['after', 'before'])
    .optional()
    .describe(
      'Set to insert code instead of replacing: "before"/"after" the from anchor (or a document boundary when from is omitted). Omit to replace or delete the from/to region.',
    ),
  to: z
    .string()
    .optional()
    .describe(
      'End of the region (inclusive): a real anchor from read/find, or "end" for the document end. Omit to target only the from line. Order-insensitive.',
    ),
})

const editInputSchema = z.object({
  edits: z
    .preprocess(parseStringifiedEdits, z.array(anchorEditSchema).min(1))
    .describe(
      'One or more edits. All from/to anchors resolve against the original document and apply atomically. Each edit carries its own action so the user sees one label per change.',
    ),
})

/**
 * Apply anchored line-range edits to the project HTML document. Batched edits
 * are resolved against the original anchored document, validated atomically,
 * and persisted through the project store on success. Each edit's `action` is
 * surfaced to the UI as its own block. Returns concise metadata and a bounded
 * changed anchored region, never the full HTML.
 */
export function createEditTool(store: HtmlStore) {
  return createTool({
    description:
      'Edit the project HTML using anchors from read/find. Each edit is { action, from?, to?, code?, insert? }. from/to accept a real anchor or the "start"/"end" sentinels for document boundaries; omit both from and to (with code) to replace the whole document (initial page). Discriminate by field presence: give from (and optional to) plus code to replace a region, or omit code to delete it; set insert to "before"/"after" to insert code relative to from (or a document boundary when from is omitted). from/to are order-insensitive (resolved by document position). Each edit carries its own action shown to the user. Combine related non-overlapping edits in one call. The preview updates automatically after a successful edit. The result is concise metadata, not the full file.',
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
          action: z.string().optional(),
          changedLines: z.number(),
          changedText: z.string(),
          firstChangedAnchor: z.string().optional(),
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

function parseStringifiedEdits(value: unknown): unknown {
  // Models occasionally pass the `edits` array as a JSON string. Parse it so
  // the array validation can proceed; a malformed string falls through and
  // fails validation with the usual array-type error.
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function toAnchorEdits(edits: unknown): ApplyAnchorEdit[] {
  return (edits as ApplyAnchorEdit[]).map((edit) => ({ ...edit }))
}
