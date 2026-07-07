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

    expect(readHtmlDocumentLines(document, { from: 'a2' })).toMatchObject({
      endAnchor: 'a2',
      lines: 1,
      startAnchor: 'a2',
      text: 'a2|  <h1>Hello</h1>',
      totalLines: 3,
      truncatedLines: false,
    })
    expect(readHtmlDocumentLines(document, { from: 'a2', to: 'a3' }).text).toBe(
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
        action: 'edit-1',
        code: '  <h1>Hi</h1>',
        from: 'a2',
      },
      {
        action: 'edit-2',
        code: '  <a href="#cta">Start</a>\n',
        from: 'a3',
        insert: 'after',
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
        action: 'edit-3',
        code: '<!doctype html>\n<html></html>',
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
        { action: 'edit-1', code: '<h1>Hi</h1>', from: 'missing' },
      ]),
    ).toThrow('missing anchor')

    expect(() =>
      applyAnchorEdits(document, [
        { action: 'edit-2', code: '<main>new</main>', from: 'a1', to: 'a3' },
        { action: 'edit-3', from: 'a2' },
      ]),
    ).toThrow('overlap')

    expect(() =>
      applyAnchorEdits(document, [
        { action: 'edit-4', code: '  <h1>Hello</h1>', from: 'a2' },
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

  it('validates read ranges and edit inputs', () => {
    const document = createHtmlDocumentFromString(
      '<main>\n  <h1>Hello</h1>\n  <p>World</p>\n</main>',
    )

    expect(() =>
      readHtmlDocumentLines(document, { from: 'missing' }),
    ).toThrow('missing anchor')
    expect(() =>
      applyAnchorEdits(document, [
        { action: 'edit-5', code: 'x', from: 'a1', insert: 'middle' as never },
      ]),
    ).toThrow('insert must be')
    expect(() =>
      applyAnchorEdits(document, [{ action: 'edit-6' }]),
    ).toThrow('from is required for a delete')
    expect(() =>
      applyAnchorEdits(document, [
        { action: 'edit-8', code: 'x', from: 'a1', insert: 'after', to: 'a2' },
      ]),
    ).toThrow('to is not allowed with insert')
  })

  it('accepts reversed from/to (order-insensitive)', () => {
    const document = createHtmlDocumentFromString(
      '<main>\n  <h1>Hello</h1>\n  <p>World</p>\n</main>',
    )
    const result = applyAnchorEdits(document, [
      { action: 'edit-7', code: '<section>new</section>', from: 'a3', to: 'a1' },
    ])
    // a1..a3 span <main>+h1+p; reversed endpoints resolve by position.
    expect(renderHtmlDocument(result.document)).toBe(
      '<section>new</section>\n</main>',
    )
  })

  it('resolves "start" and "end" sentinels as document boundaries', () => {
    const document = createHtmlDocumentFromString(
      '<main>\n  <h1>Hello</h1>\n  <p>World</p>\n</main>\n',
    )
    const full = applyAnchorEdits(document, [
      { action: 'whole via sentinels', code: '<div>all</div>', from: 'start', to: 'end' },
    ])
    expect(renderHtmlDocument(full.document)).toBe('<div>all</div>')
    const tail = applyAnchorEdits(document, [
      { action: 'a3 to end', code: '  <p>new</p>', from: 'a3', to: 'end' },
    ])
    // a3..<end> covers <p>World</p> + </main>; the document's final newline is kept.
    expect(renderHtmlDocument(tail.document)).toBe(
      '<main>\n  <h1>Hello</h1>\n  <p>new</p>\n',
    )
  })

  it('still rejects invented (non-sentinel) anchors', () => {
    const document = createHtmlDocumentFromString('<main></main>')
    expect(() =>
      applyAnchorEdits(document, [
        { action: 'invented', code: 'y', from: 'a1v__2' },
      ]),
    ).toThrow('missing anchor')
  })

  it('returns per-edit result slices for a non-adjacent multi-edit batch', () => {
    const document = createHtmlDocumentFromString(
      '<main>\n  <h1>Hello</h1>\n  <p>World</p>\n</main>\n',
    )

    const result = applyAnchorEdits(document, [
      {
        action: 'Rewrite headline',
        code: '  <h1>Hi</h1>',
        from: 'a2',
      },
      {
        action: 'Rewrite paragraph',
        code: '  <p>There</p>',
        from: 'a3',
      },
    ])

    expect(result.edits).toHaveLength(2)
    // Each edit's changedText contains only its own line — not the in-between
    // unchanged line, and not the other edit's text.
    expect(result.edits[0]).toMatchObject({ action: 'Rewrite headline' })
    expect(result.edits[0]?.changedText).toContain('Hi')
    expect(result.edits[0]?.changedText).not.toContain('There')
    expect(result.edits[1]).toMatchObject({ action: 'Rewrite paragraph' })
    expect(result.edits[1]?.changedText).toContain('There')
    expect(result.edits[1]?.changedText).not.toContain('Hi')
    // Per-edit anchors are present and distinct.
    expect(result.edits[0]?.firstChangedAnchor).toBeTruthy()
    expect(result.edits[0]?.lastChangedAnchor).toBe(
      result.edits[0]?.firstChangedAnchor,
    )
    expect(result.edits[1]?.firstChangedAnchor).toBeTruthy()
    expect(result.edits[1]?.firstChangedAnchor).not.toBe(
      result.edits[0]?.firstChangedAnchor,
    )
  })

  it('returns an empty changedText slice for a delete edit', () => {
    const document = createHtmlDocumentFromString(
      '<main>\n  <h1>Hello</h1>\n</main>\n',
    )

    const result = applyAnchorEdits(document, [
      { action: 'Delete heading', from: 'a2' },
    ])

    expect(result.edits).toHaveLength(1)
    expect(result.edits[0]).toMatchObject({
      action: 'Delete heading',
      changedLines: 0,
      changedText: '',
    })
  })
})
