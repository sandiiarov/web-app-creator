import { describe, expect, it } from 'vitest'

import {
  applyAnchorEdits,
  createHtmlDocumentFromString,
  findHtmlDocumentLines,
  parseHtmlDocumentJson,
  readHtmlDocumentLines,
  renderHtmlDocument,
} from './html-anchor-document.ts'

describe('html-anchor-document', () => {
  it('parses and renders LF/CRLF documents with stable duplicate line anchors', () => {
    const document = createHtmlDocumentFromString(
      '<div>one</div>\r\n</div>\r\n</div>\r\n\r\n',
    )

    expect(document).toMatchObject({
      finalNewline: true,
      lineEnding: '\r\n',
      nextAnchor: 5,
      version: 1,
    })
    expect(document.lines).toEqual([
      ['a1', '<div>one</div>'],
      ['a2', '</div>'],
      ['a3', '</div>'],
      ['a4', ''],
    ])
    expect(renderHtmlDocument(document)).toBe(
      '<div>one</div>\r\n</div>\r\n</div>\r\n\r\n',
    )
  })

  it('reads compact anchored line ranges without raw JSON', () => {
    const document = createHtmlDocumentFromString(
      '<main>\n  <h1>Hello</h1>\n</main>\n',
    )

    expect(readHtmlDocumentLines(document, { range: ['a2'] })).toMatchObject({
      endAnchor: 'a2',
      lines: 1,
      startAnchor: 'a2',
      text: 'a2|  <h1>Hello</h1>',
      totalLines: 3,
      truncatedLines: false,
    })
    expect(readHtmlDocumentLines(document, { limit: 2, offset: 2 }).text).toBe(
      'a2|  <h1>Hello</h1>\na3|</main>',
    )
  })

  it('finds literal text with compact context lines', () => {
    const document = createHtmlDocumentFromString(
      '<main>\n  <h1>Hello</h1>\n  <p>World</p>\n</main>',
    )

    expect(
      findHtmlDocumentLines(document, { context: 1, text: 'Hello' }),
    ).toMatchObject({
      matchCount: 1,
      returnedLines: 3,
      text: 'a1|<main>\na2|  <h1>Hello</h1>\na3|  <p>World</p>',
    })
  })

  it('returns non-throwing regex errors for find', () => {
    const document = createHtmlDocumentFromString('<main></main>')

    expect(
      findHtmlDocumentLines(document, { regex: true, text: '[' }),
    ).toMatchObject({
      error: expect.stringContaining('Invalid regex'),
      matchCount: 0,
      text: '',
    })
  })

  it('applies batches against original anchors and preserves untouched anchors', () => {
    const document = createHtmlDocumentFromString(
      '<main>\n  <h1>Hello</h1>\n  <p>World</p>\n</main>\n',
    )
    const result = applyAnchorEdits(document, [
      {
        intent: 'edit-1',
        operation: 'replace',
        range: ['a2'],
        text: '  <h1>Hi</h1>',
      },
      {
        intent: 'edit-2',
        operation: 'insert_after',
        range: ['a3'],
        text: '  <a href="#cta">Start</a>\n',
      },
    ])

    expect(renderHtmlDocument(result.document)).toBe(
      '<main>\n  <h1>Hi</h1>\n  <p>World</p>\n  <a href="#cta">Start</a>\n</main>\n',
    )
    expect(result.document.lines).toEqual([
      ['a1', '<main>'],
      ['a5', '  <h1>Hi</h1>'],
      ['a3', '  <p>World</p>'],
      ['a6', '  <a href="#cta">Start</a>'],
      ['a4', '</main>'],
    ])
    expect(result).toMatchObject({
      firstChangedAnchor: 'a5',
      firstChangedLine: 2,
      lastChangedAnchor: 'a6',
    })
    expect(document.lines).toEqual([
      ['a1', '<main>'],
      ['a2', '  <h1>Hello</h1>'],
      ['a3', '  <p>World</p>'],
      ['a4', '</main>'],
    ])
  })

  it('supports whole-document replacement with range []', () => {
    const document = createHtmlDocumentFromString('<main>Old</main>\n')
    const result = applyAnchorEdits(document, [
      {
        intent: 'edit-3',
        operation: 'replace',
        range: [],
        text: '<!doctype html>\n<html></html>',
      },
    ])

    expect(renderHtmlDocument(result.document)).toBe(
      '<!doctype html>\n<html></html>',
    )
    expect(result.document).toMatchObject({ finalNewline: false })
    expect(result.document.lines).toEqual([
      ['a2', '<!doctype html>'],
      ['a3', '<html></html>'],
    ])
    expect(result).toMatchObject({
      firstChangedAnchor: 'a2',
      firstChangedLine: 1,
      lastChangedAnchor: 'a3',
    })
  })

  it('rejects missing anchors, overlapping ranges, and no-op edits atomically', () => {
    const document = createHtmlDocumentFromString(
      '<main>\n  <h1>Hello</h1>\n  <p>World</p>\n</main>',
    )

    expect(() =>
      applyAnchorEdits(document, [
        { intent: 'edit-1', operation: 'replace', range: ['missing'], text: '<h1>Hi</h1>' },
      ]),
    ).toThrow('missing anchor')

    expect(() =>
      applyAnchorEdits(document, [
        { intent: 'edit-2', operation: 'replace', range: ['a1', 'a3'], text: '<main>new</main>' },
        { intent: 'edit-3', operation: 'delete', range: ['a2'] },
      ]),
    ).toThrow('overlap')

    expect(() =>
      applyAnchorEdits(document, [
        { intent: 'edit-4', operation: 'replace', range: ['a2'], text: '  <h1>Hello</h1>' },
      ]),
    ).toThrow('No changes made')

    expect(renderHtmlDocument(document)).toBe(
      '<main>\n  <h1>Hello</h1>\n  <p>World</p>\n</main>',
    )
  })

  it('validates parsed html.json checksums and duplicate anchors', () => {
    const document = createHtmlDocumentFromString('<main></main>')

    expect(parseHtmlDocumentJson(document)).toEqual(document)
    expect(() => parseHtmlDocumentJson(null)).toThrow(
      'html.json must be an object',
    )
    expect(() =>
      parseHtmlDocumentJson({ ...document, checksum: 'sha256:wrong' }),
    ).toThrow('checksum')
    expect(() =>
      parseHtmlDocumentJson({ ...document, checksum: 'wrong' }),
    ).toThrow('checksum must start')
    expect(() =>
      parseHtmlDocumentJson({ ...document, finalNewline: 'yes' }),
    ).toThrow('finalNewline')
    expect(() =>
      parseHtmlDocumentJson({
        ...document,
        lines: [
          ['a1', '<main>'],
          ['a1', '</main>'],
        ],
      }),
    ).toThrow('duplicate anchor')
  })

  it('validates read ranges and edit operations', () => {
    const document = createHtmlDocumentFromString(
      '<main>\n  <h1>Hello</h1>\n  <p>World</p>\n</main>',
    )

    expect(() =>
      readHtmlDocumentLines(document, { offset: 1, range: ['a1'] }),
    ).toThrow('mutually exclusive')
    expect(() => readHtmlDocumentLines(document, { offset: 0 })).toThrow(
      'positive integer',
    )
    expect(() =>
      readHtmlDocumentLines(document, { range: ['a3', 'a1'] }),
    ).toThrow('end anchor must not come before start anchor')
    expect(() =>
      applyAnchorEdits(document, [
        { intent: 'edit-5', operation: 'move' as never, range: ['a1'], text: 'x' },
      ]),
    ).toThrow('operation is not supported')
    expect(() =>
      applyAnchorEdits(document, [
        { intent: 'edit-6', operation: 'delete', range: [], text: '' },
      ]),
    ).toThrow('range cannot be [] for delete')
    expect(() =>
      applyAnchorEdits(document, [
        { intent: 'edit-7', operation: 'replace', range: ['a3', 'a1'], text: 'x' },
      ]),
    ).toThrow('end anchor must not come before start anchor')
  })
})
