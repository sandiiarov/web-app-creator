import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import {
  HASHLINE_EDIT_GUIDANCE,
  HASHLINE_PATH,
} from '../lib/hashline/edit-prompt.ts'
import { formatHashlineHeader } from '../lib/hashline/format.ts'
import type { Filesystem } from '../lib/hashline/fs.ts'
import { checkHtmlBalance } from '../lib/hashline/html-balance-guard.ts'
import { splitPatchInput } from '../lib/hashline/input.ts'
import { Patcher } from '../lib/hashline/patcher.ts'
import type { SnapshotStore } from '../lib/hashline/snapshots.ts'

/**
 * Apply a hashline-DSL edit to the project HTML. The `diff` must start with the
 * `[index.html#TAG]` header from the latest read/find; the engine verifies the
 * snapshot tag (rejecting stale/drifted references with a re-read instruction),
 * applies the `SWAP`/`DEL`/`INS` ops, runs an HTML-tag-balance guard, then
 * persists through the store. Throws on stale tag, malformed diff, or
 * balance failure so the agent re-reads and retries.
 */
export function createEditTool(
  fs: Filesystem,
  snapshots: SnapshotStore,
  path: string = HASHLINE_PATH,
) {
  return createTool({
    description: HASHLINE_EDIT_GUIDANCE,
    execute: async ({ diff }) => {
      const { sections } = splitPatchInput(diff)
      if (sections.length === 0) {
        throw new Error(
          `Edit failed: no [${path}#TAG] header found in diff. Start the diff with the header copied verbatim from your latest read, then SWAP/DEL/INS ops with +TEXT body rows.`,
        )
      }
      const patcher = new Patcher({ fs, snapshots })
      let firstChangedLine = 0
      let warnings: string[] = []
      let tag = ''
      let before = ''
      let after = ''
      for (const section of sections) {
        // prepare() validates the snapshot tag — throws MismatchError on stale.
        const prepared = await patcher.prepare(section)
        const nextHtml = prepared.applyResult.text
        const balance = checkHtmlBalance(nextHtml)
        if (!balance.ok) {
          throw new Error(
            `Edit rejected: it would produce unbalanced HTML (${balance.issues.join('; ')}). Re-read the file and narrow the SWAP range to only the lines whose content changes.`,
          )
        }
        const result = await patcher.commit(prepared)
        firstChangedLine = result.firstChangedLine ?? 0
        warnings = result.warnings
        tag = result.fileHash
        before = result.before
        after = result.after
      }
      const header = tag ? formatHashlineHeader(path, tag) : ''
      return {
        bytes: Buffer.byteLength(after, 'utf8'),
        diffPreview: buildPreview(before, after),
        firstChangedLine,
        header,
        ok: true as const,
        tag,
        warnings,
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
      diff: z
        .string()
        .min(1)
        .describe(
          'Hashline DSL: `[index.html#TAG]` header (TAG from latest read) then ops — `SWAP N.=M:`/`DEL N.=M`/`INS.PRE|POST|HEAD|TAIL N:` with `+TEXT` body rows. One edit may carry many ops (and several TAG sections): batch a whole section or a complete fix into one edit rather than many small calls.',
        ),
    }),
    outputSchema: z.object({
      bytes: z.number(),
      diffPreview: z.string(),
      firstChangedLine: z.number(),
      header: z.string(),
      ok: z.literal(true),
      tag: z.string(),
      warnings: z.array(z.string()),
    }),
  })
}

/** Compact before/after preview so the UI can show what changed. */
function buildPreview(before: string, after: string): string {
  const beforeLines = before.split('\n')
  const afterLines = after.split('\n')
  const max = Math.min(3, Math.max(beforeLines.length, afterLines.length))
  const parts: string[] = []
  for (let i = 0; i < max; i += 1) {
    const b = beforeLines[i] ?? ''
    const a = afterLines[i] ?? ''
    if (b !== a) {
      if (b) parts.push(`- ${b}`)
      if (a) parts.push(`+ ${a}`)
    }
  }
  return parts.length === 0 ? '(no visible change at head)' : parts.join('\n')
}
