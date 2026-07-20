import { describe, expect, it } from 'vitest'

import { createHtmlDocumentFromString } from '../html-anchor-document.ts'
import {
  AnchorStaleError,
  applyAnchorEdits,
  type AnchorHunk,
} from './engine.ts'

/** Build a doc and return it plus a map of line-text → anchor for assertions. */
function docFrom(html: string) {
  const doc = createHtmlDocumentFromString(html)
  const anchorOf = new Map<string, string>()
  for (const [a, t] of doc.lines) anchorOf.set(t, a)
  return { anchorOf, doc }
}

const SIMPLE = `<!doctype html>
<html>
<body>
</body>
</html>
`

describe('applyAnchorEdits', () => {
  it('inserts by expanding a span (replace container open..close)', () => {
    const { anchorOf, doc } = docFrom(SIMPLE)
    const start = anchorOf.get('<body>')!
    const end = anchorOf.get('</body>')!
    const hunks: AnchorHunk[] = [
      {
        endAnchor: end,
        lines: ['<body>', '<section>Hi</section>', '</body>'],
        startAnchor: start,
      },
    ]
    const res = applyAnchorEdits(doc, hunks)
    const rendered = res.document.lines.map(([, t]) => t)
    expect(rendered).toEqual([
      '<!doctype html>',
      '<html>',
      '<body>',
      '<section>Hi</section>',
      '</body>',
      '</html>',
    ])
    // untouched lines keep their anchors
    expect(res.document.lines[0]![0]).toBe('a1')
    expect(res.document.lines[1]![0]).toBe('a2')
    expect(res.document.lines[5]![0]).toBe('a5')
    // delta carries the 3 fresh-anchor lines
    expect(res.deltas[0]!.lines).toHaveLength(3)
    expect(res.deltas[0]!.lines.map((l) => l[0])).toEqual(['a6', 'a7', 'a8'])
  })

  it('replaces a single line (start == end)', () => {
    const { anchorOf, doc } = docFrom(SIMPLE)
    const a = anchorOf.get('<html>')!
    const res = applyAnchorEdits(doc, [
      { endAnchor: a, lines: ['<html lang="en">'], startAnchor: a },
    ])
    expect(res.document.lines[1]![1]).toBe('<html lang="en">')
    expect(res.deltas[0]!.lines).toHaveLength(1)
  })

  it('deletes a span (empty content)', () => {
    const { anchorOf, doc } = docFrom(SIMPLE)
    const start = anchorOf.get('<body>')!
    const end = anchorOf.get('</body>')!
    const res = applyAnchorEdits(doc, [
      { endAnchor: end, lines: [], startAnchor: start },
    ])
    expect(res.document.lines.map(([, t]) => t)).toEqual([
      '<!doctype html>',
      '<html>',
      '</html>',
    ])
    expect(res.deltas[0]!.lines).toEqual([])
  })

  it('preserves an untouched line anchor across a multi-line edit elsewhere', () => {
    const { anchorOf, doc } = docFrom(SIMPLE)
    const htmlAnchor = anchorOf.get('</html>')!
    const start = anchorOf.get('<body>')!
    const end = anchorOf.get('</body>')!
    const res = applyAnchorEdits(doc, [
      {
        endAnchor: end,
        lines: ['<body>', '<p>x</p>', '</body>'],
        startAnchor: start,
      },
    ])
    const stillThere = res.document.lines.find(([a]) => a === htmlAnchor)
    expect(stillThere).toBeDefined()
    expect(stillThere![1]).toBe('</html>')
  })

  it('rejects an unknown anchor as stale', () => {
    const { doc } = docFrom(SIMPLE)
    expect(() =>
      applyAnchorEdits(doc, [
        { endAnchor: 'zzz', lines: ['x'], startAnchor: 'zzz' },
      ]),
    ).toThrow(AnchorStaleError)
  })

  it('rejects overlapping ranges', () => {
    const { anchorOf, doc } = docFrom(SIMPLE)
    const body = anchorOf.get('<body>')!
    const close = anchorOf.get('</body>')!
    expect(() =>
      applyAnchorEdits(doc, [
        { endAnchor: close, lines: ['x'], startAnchor: body },
        { endAnchor: body, lines: ['y'], startAnchor: body },
      ]),
    ).toThrow(/overlap/i)
  })

  it('rejects a reversed range', () => {
    const { anchorOf, doc } = docFrom(SIMPLE)
    const body = anchorOf.get('<body>')! // a3
    const close = anchorOf.get('</body>')! // a4
    expect(() =>
      applyAnchorEdits(doc, [
        { endAnchor: body, lines: ['x'], startAnchor: close },
      ]),
    ).toThrow(/reversed/i)
  })

  it('rejects an edit that produces unbalanced HTML', () => {
    const { anchorOf, doc } = docFrom(SIMPLE)
    const a = anchorOf.get('<body>')!
    expect(() =>
      applyAnchorEdits(doc, [
        { endAnchor: a, lines: ['<div>'], startAnchor: a },
      ]),
    ).toThrow(/unbalanced/i)
  })

  it('repairs a TRUNCATED edit by appending missing closers (anchors preserved)', () => {
    const doc = createHtmlDocumentFromString(
      '<html>\n<body>\n<main>\n</main>\n</body>\n</html>\n',
    )
    // anchors: a1 <html>, a2 <body>, a3 <main>, a4 </main>, a5 </body>, a6 </html>
    const res = applyAnchorEdits(doc, [
      { endAnchor: 'a6', lines: ['<section>'], startAnchor: 'a6' },
    ])
    expect(res.document.lines[0]![0]).toBe('a1')
    expect(res.document.lines[4]![0]).toBe('a5')
    expect(res.warnings.join(' ')).toMatch(/appended 2 truncated/)
    const rendered = res.document.lines.map(([, t]) => t)
    expect(rendered[rendered.length - 2]).toBe('</section>')
    expect(rendered[rendered.length - 1]).toBe('</html>')
    const allDeltaLines = res.deltas.flatMap((d) => d.lines)
    expect(allDeltaLines.some(([, t]) => t === '</section>')).toBe(true)
    expect(allDeltaLines.some(([, t]) => t === '</html>')).toBe(true)
  })

  it('rejects an empty hunk list', () => {
    const { doc } = docFrom(SIMPLE)
    expect(() => applyAnchorEdits(doc, [])).toThrow(/no REPLACE hunks/)
  })
})
