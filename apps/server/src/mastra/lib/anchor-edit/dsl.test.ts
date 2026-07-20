import { describe, expect, it } from 'vitest'

import { createHtmlDocumentFromString } from '../html-anchor-document.ts'
import { formatAnchorDelta, formatAnchorRead } from './dsl.ts'

describe('formatting', () => {
  it('formatAnchorRead emits a generation marker + labeled lines', () => {
    const doc = createHtmlDocumentFromString('<body>\n</body>\n')
    const out = formatAnchorRead(doc)
    const lines = out.split('\n')
    expect(lines[0]).toMatch(/^@[0-9A-F]{4}$/)
    expect(lines[1]).toBe('a1 <body>')
    expect(lines[2]).toBe('a2 </body>')
  })

  it('formatAnchorDelta emits labeled new lines', () => {
    const out = formatAnchorDelta([
      {
        endAnchor: 'a4',
        lines: [
          ['a6', '<body>'],
          ['a7', '<section>Hi</section>'],
        ],
        startAnchor: 'a3',
      },
    ])
    expect(out).toBe('a6 <body>\na7 <section>Hi</section>')
  })
})
