import { createHash } from 'node:crypto'

/**
 * Anchored HTML document model — the persisted shape of a project's
 * `html.json`. Each line carries a stable anchor (`a1`, `a2`, … base-36) so
 * the document can be rendered to HTML and re-parsed losslessly. The anchor
 * edit engine in `lib/anchor-edit/` edits this document in place (splicing
 * `lines`, preserving anchors); this module is the storage/round-trip backbone.
 */

export interface HtmlDocumentJsonV1 {
  checksum: `sha256:${string}`
  finalNewline: boolean
  lineEnding: '\n' | '\r\n'
  lines: HtmlLine[]
  nextAnchor: number
  version: 1
}

export type HtmlLine = [anchor: string, text: string]

export function cloneHtmlDocument(
  document: HtmlDocumentJsonV1,
): HtmlDocumentJsonV1 {
  return {
    ...document,
    lines: document.lines.map(([anchor, text]) => [anchor, text]),
  }
}

export function createHtmlDocumentFromString(html: string): HtmlDocumentJsonV1 {
  const lineEnding = detectLineEnding(html)
  const { finalNewline, lines } = splitHtmlIntoDocumentLines(html)
  let nextAnchor = 1
  const anchoredLines = lines.map(
    (line): HtmlLine => [createAnchor(nextAnchor++), line],
  )

  return normalizeHtmlDocument({
    checksum: 'sha256:',
    finalNewline,
    lineEnding,
    lines: anchoredLines,
    nextAnchor,
    version: 1,
  })
}

export function normalizeHtmlDocument(
  document: HtmlDocumentJsonV1,
): HtmlDocumentJsonV1 {
  validateHtmlDocumentShape(document)
  const normalized: HtmlDocumentJsonV1 = {
    checksum: 'sha256:',
    finalNewline: document.finalNewline,
    lineEnding: document.lineEnding,
    lines: document.lines.map(([anchor, text]) => [anchor, text]),
    nextAnchor: document.nextAnchor,
    version: 1,
  }
  normalized.checksum = checksumHtml(renderHtmlDocument(normalized))

  if (
    document.checksum &&
    document.checksum !== 'sha256:' &&
    document.checksum !== normalized.checksum
  ) {
    throw new Error('html.json checksum does not match its rendered HTML.')
  }

  return normalized
}

export function parseHtmlDocumentJson(value: unknown): HtmlDocumentJsonV1 {
  if (!value || typeof value !== 'object') {
    throw new Error('html.json must be an object.')
  }
  return normalizeHtmlDocument(value as HtmlDocumentJsonV1)
}

export function renderHtmlDocument(document: HtmlDocumentJsonV1): string {
  const body = document.lines.map(([, text]) => text).join(document.lineEnding)
  return document.finalNewline ? `${body}${document.lineEnding}` : body
}

function checksumHtml(html: string): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(html).digest('hex')}`
}

function createAnchor(nextAnchor: number): string {
  return `a${nextAnchor.toString(36)}`
}

function detectLineEnding(html: string): '\n' | '\r\n' {
  return html.includes('\r\n') ? '\r\n' : '\n'
}

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function splitHtmlIntoDocumentLines(html: string): {
  finalNewline: boolean
  lines: string[]
} {
  const normalized = normalizeLineEndings(html)
  const finalNewline = normalized.endsWith('\n')
  if (normalized.length === 0) return { finalNewline, lines: [] }

  if (!finalNewline) return { finalNewline, lines: normalized.split('\n') }

  const body = normalized.slice(0, -1)
  return {
    finalNewline,
    lines: body.length === 0 ? [''] : body.split('\n'),
  }
}

function validateHtmlDocumentShape(document: HtmlDocumentJsonV1) {
  if (document.version !== 1) {
    throw new Error('html.json version must be 1.')
  }
  if (document.lineEnding !== '\n' && document.lineEnding !== '\r\n') {
    throw new Error('html.json lineEnding must be LF or CRLF.')
  }
  if (typeof document.finalNewline !== 'boolean') {
    throw new Error('html.json finalNewline must be a boolean.')
  }
  if (!Number.isInteger(document.nextAnchor) || document.nextAnchor < 1) {
    throw new Error('html.json nextAnchor must be a positive integer.')
  }
  if (!Array.isArray(document.lines)) {
    throw new Error('html.json lines must be an array.')
  }

  const anchors = new Set<string>()
  for (const line of document.lines) {
    if (!Array.isArray(line) || line.length !== 2) {
      throw new Error('html.json lines must contain [anchor, text] tuples.')
    }
    const [anchor, text] = line
    if (typeof anchor !== 'string' || anchor.length === 0) {
      throw new Error('html.json line anchors must be non-empty strings.')
    }
    if (typeof text !== 'string') {
      throw new Error('html.json line text must be strings.')
    }
    if (anchors.has(anchor)) {
      throw new Error(`html.json contains duplicate anchor ${anchor}.`)
    }
    anchors.add(anchor)
  }

  if (
    document.checksum !== undefined &&
    !document.checksum.startsWith('sha256:')
  ) {
    throw new Error('html.json checksum must start with sha256:.')
  }
}
