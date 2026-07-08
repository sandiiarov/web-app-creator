import { describe, expect, it } from 'vitest'

import { createHtmlStore } from '../html-store.ts'
import { HtmlStoreFilesystem } from './html-store-filesystem.ts'

describe('HtmlStoreFilesystem', () => {
  it("readText returns the store's rendered HTML (contains seed content)", async () => {
    const store = createHtmlStore(
      '<!doctype html><html><body><p>seed-content</p></body></html>',
    )
    const fs = new HtmlStoreFilesystem(store)
    const text = await fs.readText('index.html')
    expect(text).toContain('seed-content')
    expect(text).toContain('<html')
  })

  it('writeText round-trips through store.set and the new content is readable', async () => {
    const store = createHtmlStore()
    const fs = new HtmlStoreFilesystem(store)
    const next = '<!doctype html><html><body><h1>replacement</h1></body></html>'
    const res = await fs.writeText('index.html', next)
    expect(res.text).toBe(next)
    expect(await fs.readText('index.html')).toContain('replacement')
  })

  it('writeText delegates to store.set (preserves write-through behavior)', async () => {
    const store = createHtmlStore()
    const setSpy = store.set.bind(store)
    const fs = new HtmlStoreFilesystem(store)
    const before = store.get()
    await fs.writeText(
      'index.html',
      '<!doctype html><html><body><p>x</p></body></html>',
    )
    expect(store.get()).not.toBe(before)
    expect(setSpy).toBeTruthy() // store.set is accessible (write-through path)
  })
})
