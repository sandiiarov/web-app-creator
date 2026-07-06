import { describe, expect, it } from 'vitest'

import {
  applyEdits,
  countChangedLines,
  detectLineEnding,
  fuzzyFindText,
  generateDiffString,
  generateUnifiedPatch,
  normalizeForFuzzyMatch,
  normalizeToLF,
  restoreLineEndings,
  stripBom,
} from './edit-diff.ts'

describe('applyEdits', () => {
  it('applies multiple replacements against the original content', () => {
    const html =
      '<style>\n.foo { color: red; }\n.bar { color: blue; }\n</style>'

    expect(
      applyEdits(html, [
        {
          newText: '.foo { color: green; }',
          oldText: '.foo { color: red; }',
        },
        {
          newText: '.bar { color: purple; }',
          oldText: '.bar { color: blue; }',
        },
      ]),
    ).toBe('<style>\n.foo { color: green; }\n.bar { color: purple; }\n</style>')
  })

  it('preserves BOM and CRLF line endings', () => {
    const html = '\uFEFF<div>alpha</div>\r\n<div>beta</div>\r\n'

    expect(
      applyEdits(html, [
        {
          newText: '<div>gamma</div>',
          oldText: '<div>alpha</div>',
        },
      ]),
    ).toBe('\uFEFF<div>gamma</div>\r\n<div>beta</div>\r\n')
  })

  it('accepts oldText copied from numbered read output', () => {
    const html = '<main>\n  <h1>Hello</h1>\n  <p>World</p>\n</main>'

    expect(
      applyEdits(html, [
        {
          newText: '  <h1>Hi</h1>\n  <p>World</p>',
          oldText: '2    <h1>Hello</h1>\n3    <p>World</p>',
        },
      ]),
    ).toBe('<main>\n  <h1>Hi</h1>\n  <p>World</p>\n</main>')
  })

  it('accepts oldText copied from grep context output', () => {
    const html = '<main>\n  <h1>Hello</h1>\n  <p>World</p>\n</main>'

    expect(
      applyEdits(html, [
        {
          newText: '  <h1>Hi</h1>\n  <p>World</p>',
          oldText: '2:   <h1>Hello</h1>\n3-   <p>World</p>',
        },
      ]),
    ).toBe('<main>\n  <h1>Hi</h1>\n  <p>World</p>\n</main>')
  })

  it('matches indentation-insensitive snippets and reindents replacements', () => {
    const html =
      '<style>\n        .party { grid-template-columns: 1fr; }\n        .terminal { padding: 28px 20px; }\n</style>'

    expect(
      applyEdits(html, [
        {
          newText:
            '          .party { grid-template-columns: 1fr; }\n          .cinematics { grid-template-columns: 1fr; }\n          .terminal { padding: 28px 20px; }',
          oldText:
            '          .party { grid-template-columns: 1fr; }\n          .terminal { padding: 28px 20px; }',
        },
      ]),
    ).toBe(
      '<style>\n        .party { grid-template-columns: 1fr; }\n        .cinematics { grid-template-columns: 1fr; }\n        .terminal { padding: 28px 20px; }\n</style>',
    )
  })

  it('fails when oldText is not unique', () => {
    expect(() =>
      applyEdits('<p>x</p>\n<p>x</p>', [
        {
          newText: '<p>y</p>',
          oldText: '<p>x</p>',
        },
      ]),
    ).toThrow('Found 2 occurrences')
  })

  it('generates compact display diffs and unified patches', () => {
    const before = '<main>\n  <h1>Hello</h1>\n  <p>World</p>\n</main>'
    const after = '<main>\n  <h1>Hi</h1>\n  <p>World</p>\n</main>'

    expect(generateDiffString(before, after)).toEqual({
      diff: ' 1 <main>\n-2   <h1>Hello</h1>\n+2   <h1>Hi</h1>\n 3   <p>World</p>\n 4 </main>',
      firstChangedLine: 2,
    })
    expect(generateUnifiedPatch('/index.html', before, after)).toBe(
      '--- /index.html\n+++ /index.html\n@@ -1,4 +1,4 @@\n <main>\n-  <h1>Hello</h1>\n+  <h1>Hi</h1>\n   <p>World</p>\n </main>',
    )
  })

  it('normalizes text and finds fuzzy matches', () => {
    expect(detectLineEnding('a\r\nb\n')).toBe('\r\n')
    expect(detectLineEnding('a\nb')).toBe('\n')
    expect(normalizeToLF('a\r\nb\rc')).toBe('a\nb\nc')
    expect(restoreLineEndings('a\nb', '\r\n')).toBe('a\r\nb')
    expect(stripBom('\uFEFF<html>')).toEqual({ bom: '\uFEFF', text: '<html>' })
    expect(normalizeForFuzzyMatch('“Hello”—world\u00A0')).toBe('"Hello"-world')
    expect(fuzzyFindText('Hero “Launch”\n', 'Hero "Launch"')).toMatchObject({
      found: true,
      usedFuzzyMatch: true,
    })
    expect(fuzzyFindText('Hero Launch', 'Missing')).toMatchObject({
      found: false,
      index: -1,
    })
  })

  it('reports edit validation errors with single and batch messages', () => {
    expect(() =>
      applyEdits('<p>Hi</p>', [{ newText: 'x', oldText: '' }]),
    ).toThrow('oldText must not be empty')
    expect(() =>
      applyEdits('<p>Hi</p>', [
        { newText: '<p>Hello</p>', oldText: '<p>Hi</p>' },
        { newText: '<p>Hey</p>', oldText: '<p>Hi</p>' },
      ]),
    ).toThrow('overlap')
    expect(() =>
      applyEdits('<p>Hi</p>', [{ newText: '<p>Hi</p>', oldText: '<p>Hi</p>' }]),
    ).toThrow('No changes made')
    expect(() =>
      applyEdits('<p>Hi</p>', [
        { newText: '<h1>Found</h1>', oldText: '<h1>Missing</h1>' },
        { newText: '<p>Hello</p>', oldText: '<p>Hi</p>' },
      ]),
    ).toThrow('Could not find edits[0]')
  })

  it('counts changed lines and falls back to simple diffs for large files', () => {
    expect(countChangedLines('a\nb', 'a\nc\nd')).toBe(2)

    const before = Array.from(
      { length: 2100 },
      (_, index) => `old-${index}`,
    ).join('\n')
    const after = Array.from(
      { length: 2100 },
      (_, index) => `new-${index}`,
    ).join('\n')
    const diff = generateDiffString(before, after, 0)
    const patch = generateUnifiedPatch('/large.html', before, after, 0)

    expect(diff.firstChangedLine).toBe(1)
    expect(diff.diff).toContain('-   1 old-0')
    expect(diff.diff).toContain('+   1 new-0')
    expect(patch).toContain('@@ -1,2100 +1,2100 @@')
  })
})
