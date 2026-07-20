/**
 * Tool integration: bridge the anchor-label engine to the read/edit/find
 * tools. The store adapter (`HtmlStoreFilesystem`) exposes the anchored
 * document (`getDocument`/`setDocument`) and delegates here.
 */
import { renderHtmlDocument } from '../html-anchor-document.ts'
import type { HtmlDocumentJsonV1 } from '../html-anchor-document.ts'
import { formatAnchorDelta, formatAnchorRead } from './dsl.ts'
import { applyAnchorEdits, type AnchorHunk } from './engine.ts'

/** One structured range-replace (mirrors the tool's `edits` schema). */
export interface AnchorEditInput {
  readonly content: string
  readonly end: string
  readonly start: string
}

export interface AnchorEditOutput {
  bytes: number
  delta: string
  diffPreview: string
  tag: string
  warnings: readonly string[]
}

/** A store adapter that exposes the anchored document directly. */
export interface AnchorFilesystem {
  getDocument(): HtmlDocumentJsonV1
  setDocument(document: HtmlDocumentJsonV1): number
}

export interface AnchorReadOutput {
  lines: number
  tag: string
  text: string
  totalLines: number
}

/** Apply structured anchor edits; persist; return the changed-region delta. */
export function runAnchorEdit(
  fs: AnchorFilesystem,
  edits: readonly AnchorEditInput[],
): AnchorEditOutput {
  const hunks: AnchorHunk[] = edits.map((e) => ({
    endAnchor: e.end,
    lines: toLines(e.content),
    startAnchor: e.start,
  }))
  const before = fs.getDocument()
  const { deltas, document, warnings } = applyAnchorEdits(before, hunks)
  fs.setDocument(document)
  const after = fs.getDocument()
  const delta = formatAnchorDelta(deltas)
  return {
    bytes: Buffer.byteLength(renderHtmlDocument(after), 'utf8'),
    delta,
    diffPreview: delta.length > 0 ? delta : '(empty replace — region deleted)',
    tag: tagFromChecksum(after.checksum),
    warnings,
  }
}

/** Read the whole document as `<anchor> <text>` labeled lines. */
export function runAnchorRead(fs: AnchorFilesystem): AnchorReadOutput {
  const doc = fs.getDocument()
  return {
    lines: doc.lines.length,
    tag: tagFromChecksum(doc.checksum),
    text: formatAnchorRead(doc),
    totalLines: doc.lines.length,
  }
}

function tagFromChecksum(checksum: string): string {
  if (!checksum || checksum === 'sha256:') return ''
  return checksum.slice('sha256:'.length).slice(0, 4).toUpperCase()
}

/** Split a content string into document lines. Empty string = delete the span. */
function toLines(content: string): string[] {
  if (content === '') return []
  const body = content.endsWith('\n') ? content.slice(0, -1) : content
  return body.split('\n')
}
