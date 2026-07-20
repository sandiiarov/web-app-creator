import { describe, expect, it } from 'vitest'

import { HtmlStoreFilesystem } from '../lib/anchor-edit/html-store-filesystem.ts'
import { createHtmlStore } from '../lib/html-store.ts'
import { createFindTool } from './find.ts'

const DOC = [
  '<!doctype html>',
  '<html>',
  '  <body>',
  '    <h1>Hello</h1>',
  '    <p>World</p>',
  '  </body>',
  '</html>',
].join('\n')

describe('find (anchor-label engine)', () => {
  it('returns matching lines as <anchor> <text>', async () => {
    const fs = new HtmlStoreFilesystem(createHtmlStore(DOC))
    const find = createFindTool(fs)
    const res = (await find.execute?.(
      { action: 'find h1', text: 'h1' },
      undefined as never,
    )) as { matchCount: number; ok: true; text: string }
    expect(res.ok).toBe(true)
    expect(res.matchCount).toBe(1)
    expect(res.text).toContain('a4     <h1>Hello</h1>')
    expect(res.text).not.toContain('a5') // no context → only the match line
  })

  it('includes context lines around matches', async () => {
    const fs = new HtmlStoreFilesystem(createHtmlStore(DOC))
    const find = createFindTool(fs)
    const res = (await find.execute?.(
      { action: 'find h1 with ctx', context: 1, text: 'h1' },
      undefined as never,
    )) as { text: string }
    // match line a4 + 1 line of context each side (a3, a5)
    expect(res.text).toContain('a3   <body>')
    expect(res.text).toContain('a4     <h1>Hello</h1>')
    expect(res.text).toContain('a5     <p>World</p>')
  })

  it('reports no matches plainly', async () => {
    const fs = new HtmlStoreFilesystem(createHtmlStore(DOC))
    const find = createFindTool(fs)
    const res = (await find.execute?.(
      { action: 'find missing', text: 'nonexistent-token' },
      undefined as never,
    )) as { matchCount: number; text: string }
    expect(res.matchCount).toBe(0)
    expect(res.text).toContain('no matches')
  })
})
