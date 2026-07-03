import { describe, expect, it } from 'vitest'

import {
  applyEdits,
  generateDiffString,
  generateUnifiedPatch,
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
})
