import { describe, expect, it } from 'vitest'

import { createHtmlStore } from '../html-store.ts'
import { HtmlStoreFilesystem } from './html-store-filesystem.ts'

describe('HtmlStoreFilesystem', () => {
  it('getDocument returns the seeded document with stable anchors', () => {
    const store = createHtmlStore(
      '<!doctype html>\n<html>\n<body>\n<p>seed</p>\n</body>\n</html>\n',
    )
    const fs = new HtmlStoreFilesystem(store)
    const doc = fs.getDocument()
    expect(doc.lines.map(([, t]) => t)).toEqual([
      '<!doctype html>',
      '<html>',
      '<body>',
      '<p>seed</p>',
      '</body>',
      '</html>',
    ])
    expect(doc.lines[0]![0]).toBe('a1')
  })

  it('setDocument persists and the rendered HTML reflects it', () => {
    const store = createHtmlStore()
    const fs = new HtmlStoreFilesystem(store)
    fs.setDocument({
      checksum: 'sha256:',
      finalNewline: true,
      lineEnding: '\n',
      lines: [
        ['a1', '<body>'],
        ['a2', '<h1>set</h1>'],
        ['a3', '</body>'],
      ],
      nextAnchor: 4,
      version: 1,
    })
    expect(store.get()).toContain('<h1>set</h1>')
    expect(fs.getDocument().lines[1]![0]).toBe('a2') // anchors preserved round-trip
  })
})
