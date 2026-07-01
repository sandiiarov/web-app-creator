import { describe, expect, it } from 'vitest'

import { applyEdits } from './edit-diff.ts'

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
})
