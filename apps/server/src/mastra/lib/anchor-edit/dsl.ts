/**
 * v2 read/delta formatting. (The edit path takes structured `edits` args —
 * see `tool.ts` / `engine.ts` — so there is no diff parser here.)
 *
 * Read/delta output: one `<anchor> <text>` line per document line, optionally
 * preceded by a `@<checksum4>` generation marker line.
 */
import type { HtmlDocumentJsonV1, HtmlLine } from '../html-anchor-document.ts'
import type { AnchorDelta } from './engine.ts'

/** Format the changed-region deltas as labeled lines (model learns new anchors). */
export function formatAnchorDelta(deltas: readonly AnchorDelta[]): string {
  const out: HtmlLine[] = []
  for (const d of deltas) out.push(...d.lines)
  return out.map((l) => formatLabeledLine(l)).join('\n')
}

/** Format a document for a v2 read: optional `@<gen>` marker + labeled lines. */
export function formatAnchorRead(document: HtmlDocumentJsonV1): string {
  const gen = checksum4(document)
  const head = gen ? `@${gen}\n` : ''
  return head + document.lines.map((l) => formatLabeledLine(l)).join('\n')
}

/** `<anchor> <text>`; a literal ` ` always separates them. */
export function formatLabeledLine([anchor, text]: HtmlLine): string {
  return `${anchor} ${text}`
}

function checksum4(document: HtmlDocumentJsonV1): null | string {
  const c = document.checksum
  if (!c || c === 'sha256:') return null
  const hex = c.slice('sha256:'.length)
  return hex.slice(0, 4).toUpperCase()
}
