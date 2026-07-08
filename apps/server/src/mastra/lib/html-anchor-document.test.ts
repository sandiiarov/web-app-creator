import { describe, expect, it } from 'vitest'

import {
  cloneHtmlDocument,
  createHtmlDocumentFromString,
  normalizeHtmlDocument,
  parseHtmlDocumentJson,
  renderHtmlDocument,
} from './html-anchor-document.ts'

describe('html-anchor-document (storage backbone)', () => {
  it('createHtmlDocumentFromString + renderHtmlDocument round-trip', () => {
    const html = '<main>\n  <h1>Hello</h1>\n  <p>World</p>\n</main>'
    const document = createHtmlDocumentFromString(html)
    expect(renderHtmlDocument(document)).toBe(html)
  })

  it('assigns sequential base-36 anchors (a1, a2, a3, …)', () => {
    const document = createHtmlDocumentFromString('one\ntwo\nthree')
    const anchors = document.lines.map(([anchor]) => anchor)
    expect(anchors).toEqual(['a1', 'a2', 'a3'])
    expect(document.nextAnchor).toBe(4)
  })

  it('normalizeHtmlDocument recomputes the checksum from rendered HTML', () => {
    const document = createHtmlDocumentFromString('<p>x</p>')
    expect(document.checksum).toMatch(/^sha256:[0-9a-f]{64}$/)
    // Re-normalizing a valid document is idempotent (same checksum).
    expect(normalizeHtmlDocument(document).checksum).toBe(document.checksum)
  })

  it('normalizeHtmlDocument rejects a checksum that does not match its HTML', () => {
    const document = createHtmlDocumentFromString('<p>x</p>')
    const tampered = { ...document, checksum: 'sha256:deadbeef' as never }
    expect(() => normalizeHtmlDocument(tampered)).toThrow(
      /checksum does not match/,
    )
  })

  it('parseHtmlDocumentJson rejects non-object input', () => {
    expect(() => parseHtmlDocumentJson(null)).toThrow(/must be an object/)
    expect(() => parseHtmlDocumentJson('not-an-object')).toThrow(
      /must be an object/,
    )
  })

  it('cloneHtmlDocument is independent — mutating the clone does not affect the original', () => {
    const document = createHtmlDocumentFromString('a\nb')
    const copy = cloneHtmlDocument(document)
    copy.lines[0]![1] = 'MUTATED'
    expect(document.lines[0]![1]).toBe('a')
    expect(copy.lines[0]![1]).toBe('MUTATED')
  })

  it('detects + preserves CRLF line endings', () => {
    const document = createHtmlDocumentFromString('a\r\nb')
    expect(document.lineEnding).toBe('\r\n')
    expect(renderHtmlDocument(document)).toBe('a\r\nb')
  })
})
