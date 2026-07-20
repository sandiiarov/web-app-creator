/**
 * Anchor-label edit engine.
 *
 * Edits address lines by their stable document anchor (`a1`, `a2`, … — see
 * `html-anchor-document.ts`). A hunk replaces the inclusive span
 * `[startAnchor..endAnchor]` with new content. Unchanged lines keep their
 * anchors (we splice the document array in place and only mint fresh anchors
 * for inserted lines), so a model that read the document once keeps a valid
 * anchor map across its own edits — it only has to learn the new anchors the
 * tool returns in the delta.
 *
 * Staleness is detected by anchor: if a hunk's start/end anchor is absent from
 * the live document, the document changed since the model's read → reject with
 * a re-read instruction. There is no seen-line gate and no whole-file tag.
 */
import {
  type HtmlDocumentJsonV1,
  type HtmlLine,
  renderHtmlDocument,
} from '../html-anchor-document.ts'
import { checkHtmlBalance, scanNesting } from './html-balance-guard.ts'

/** What replaced a hunk's span — returned to the model so it learns new anchors. */
export interface AnchorDelta {
  readonly endAnchor: string
  /** The new `[anchor, text]` lines now occupying that span, in order. */
  readonly lines: readonly HtmlLine[]
  /** The span the model asked to replace. */
  readonly startAnchor: string
}

export interface AnchorEditResult {
  /** Deltas in the order the hunks were submitted. */
  readonly deltas: readonly AnchorDelta[]
  readonly document: HtmlDocumentJsonV1
  readonly warnings: readonly string[]
}

/** One range-replace: replace `[startAnchor..endAnchor]` with `lines`. */
export interface AnchorHunk {
  readonly endAnchor: string
  /** New content as bare text lines; anchors are minted on apply. */
  readonly lines: readonly string[]
  readonly startAnchor: string
}

/** A hunk referenced an anchor absent from the live document. */
export class AnchorStaleError extends Error {
  readonly anchor: string
  constructor(anchor: string) {
    super(
      `Anchor ${anchor} is not in the live document — the document changed since your last read. Re-read it, then re-issue the edit using current anchors.`,
    )
    this.name = 'AnchorStaleError'
    this.anchor = anchor
  }
}

/**
 * Apply anchor range-replace hunks to a document, preserving every untouched
 * line's anchor. Throws `AnchorStaleError` for an unknown anchor, and a plain
 * `Error` for reversed/overlapping ranges or an unbalanced result.
 */
export function applyAnchorEdits(
  doc: HtmlDocumentJsonV1,
  hunks: readonly AnchorHunk[],
): AnchorEditResult {
  if (hunks.length === 0) {
    throw new Error('Edit has no REPLACE hunks.')
  }

  // anchor → index
  const index = new Map<string, number>()
  for (let i = 0; i < doc.lines.length; i++) {
    index.set(doc.lines[i]![0], i)
  }

  interface Resolved {
    hunk: AnchorHunk
    i: number
    j: number
  }
  const resolved: Resolved[] = []
  for (const hunk of hunks) {
    const i = index.get(hunk.startAnchor)
    const j = index.get(hunk.endAnchor)
    if (i === undefined) throw new AnchorStaleError(hunk.startAnchor)
    if (j === undefined) throw new AnchorStaleError(hunk.endAnchor)
    if (i > j) {
      throw new Error(
        `Range ${hunk.startAnchor}..${hunk.endAnchor} is reversed (the end anchor appears before the start). Swap them.`,
      )
    }
    resolved.push({ hunk, i, j })
  }

  // Non-overlapping (sort by start index; each range must start after the
  // previous range ends).
  const byStart = [...resolved].sort((a, b) => a.i - b.i)
  for (let k = 1; k < byStart.length; k++) {
    const prev = byStart[k - 1]!
    const cur = byStart[k]!
    if (cur.i <= prev.j) {
      throw new Error(
        `Edit ranges overlap (${prev.hunk.startAnchor}..${prev.hunk.endAnchor} and ${cur.hunk.startAnchor}..${cur.hunk.endAnchor}). Merge them into a single range.`,
      )
    }
  }

  // Apply in descending index order so earlier splice indices stay valid.
  let nextAnchor = doc.nextAnchor
  const lines: HtmlLine[] = doc.lines.map((l) => [l[0], l[1]] as HtmlLine)
  const deltasByOrder = new Map<AnchorHunk, AnchorDelta>()

  for (const { hunk, i, j } of [...resolved].sort((a, b) => b.i - a.i)) {
    const newLines: HtmlLine[] = hunk.lines.map((text) => {
      const anchor = mintAnchor(nextAnchor)
      nextAnchor++
      return [anchor, text] as HtmlLine
    })
    lines.splice(i, j - i + 1, ...newLines)
    deltasByOrder.set(hunk, {
      endAnchor: hunk.endAnchor,
      lines: newLines,
      startAnchor: hunk.startAnchor,
    })
  }

  let warnings: string[] = []
  let document: HtmlDocumentJsonV1 = {
    ...doc,
    checksum: 'sha256:' as `sha256:${string}`,
    lines,
    nextAnchor,
  }

  // Balance check. v2 keeps anchors stable, so it does NOT do v1's text-level
  // autofix (which would reparse and reassign anchors). The one safe,
  // stability-preserving repair: a TRUNCATED edit (content cut off, e.g. by an
  // output cap — closers missing at EOF, clean nesting) gets its missing
  // closers appended as fresh anchored lines. Existing anchors are untouched.
  // A mid-document mismatch (eaten/duplicate closer) still rejects so the
  // model narrows the edit.
  let balance = checkHtmlBalance(renderHtmlDocument(document))
  let appendedLines: HtmlLine[] = []
  if (!balance.ok) {
    const { mismatch, stack } = scanNesting(renderHtmlDocument(document))
    if (!mismatch && stack.length > 0) {
      const reversed = [...stack].reverse()
      for (const tag of reversed) {
        appendedLines.push([mintAnchor(nextAnchor), `</${tag}>`] as HtmlLine)
        nextAnchor++
      }
      lines.push(...appendedLines)
      document = {
        ...doc,
        checksum: 'sha256:' as `sha256:${string}`,
        lines,
        nextAnchor,
      }
      balance = checkHtmlBalance(renderHtmlDocument(document))
      if (balance.ok) {
        warnings = [
          `html autofix: appended ${reversed.length} truncated closing tag(s): ${reversed.map((t) => `</${t}>`).join(' ')}`,
        ]
      }
    }
  }
  if (!balance.ok) {
    throw new Error(
      `Edit rejected: it would produce unbalanced HTML (${balance.issues.join('; ')}). Re-read the document and narrow the edit range to only the lines whose content changes.`,
    )
  }

  const deltas: AnchorDelta[] = hunks.map((h) => deltasByOrder.get(h)!)
  if (appendedLines.length > 0) {
    deltas.push({
      endAnchor: 'autofix',
      lines: appendedLines,
      startAnchor: 'autofix',
    })
  }
  return { deltas, document, warnings }
}

function mintAnchor(nextAnchor: number): string {
  return `a${nextAnchor.toString(36)}`
}
