import { describe, expect, it } from 'vitest'

import { HtmlStoreFilesystem } from '../lib/hashline/html-store-filesystem.ts'
import { createSnapshotStore } from '../lib/hashline/snapshot-store.ts'
import { createHtmlStore } from '../lib/html-store.ts'
import { createFindTool } from './find.ts'

type FindResult = {
  matchCount: number
  matchLimitReached: boolean
  ok: true
  returnedLines: number
  tag: string
  text: string
  totalLines: number
}

function makeTools(seed?: string) {
  const store = createHtmlStore(seed)
  return {
    find: createFindTool(new HtmlStoreFilesystem(store), createSnapshotStore()),
    store,
  }
}

describe('createFindTool', () => {
  it('returns matching N:TEXT rows + a snapshot tag', async () => {
    const { find } = makeTools(
      '<html>\n<body>\n<h1>Title</h1>\n<p>Body</p>\n</body>\n</html>',
    )
    const res = (await find.execute?.(
      { action: 'find title', text: 'Title' },
      undefined as never,
    )) as FindResult
    expect(res.ok).toBe(true)
    expect(res.matchCount).toBe(1)
    expect(res.tag).toMatch(/^[0-9A-F]{4}$/)
    expect(res.text.startsWith('[index.html#')).toBe(true)
    expect(res.text).toContain('Title')
  })

  it('reports no matches without erroring', async () => {
    const { find } = makeTools('<html>\n<body>\n<p>x</p>\n</body>\n</html>')
    const res = (await find.execute?.(
      { action: 'find missing', text: 'nope' },
      undefined as never,
    )) as FindResult
    expect(res.ok).toBe(true)
    expect(res.matchCount).toBe(0)
    expect(res.text).toContain('no matches')
  })

  it('regex search respects the pattern', async () => {
    const { find } = makeTools('<ul>\n<li>apple</li>\n<li>banana</li>\n</ul>')
    const res = (await find.execute?.(
      { action: 'find li', regex: true, text: '<li>' },
      undefined as never,
    )) as FindResult
    expect(res.matchCount).toBe(2)
  })

  it('context lines are included in the output', async () => {
    const { find } = makeTools(
      '<main>\n  <h1>Hello</h1>\n  <p>World</p>\n</main>',
    )
    const res = (await find.execute?.(
      { action: 'find with ctx', context: 1, text: 'Hello' },
      undefined as never,
    )) as FindResult
    expect(res.matchCount).toBe(1)
    // context=1 → the match line plus one before and one after
    expect(res.returnedLines).toBe(3)
    expect(res.text).toContain('Hello')
    expect(res.text).toContain('World')
  })
})
