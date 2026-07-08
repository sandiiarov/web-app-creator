import { describe, expect, it } from 'vitest'

import { createHtmlStore, PLACEHOLDER_INDEX_HTML } from './html-store.ts'

describe('createHtmlStore', () => {
  it('renders from an anchored document while preserving get/set compatibility', () => {
    const store = createHtmlStore('<main>\n  <h1>Hello</h1>\n</main>\n')

    expect(store.get()).toBe('<main>\n  <h1>Hello</h1>\n</main>\n')
    expect(store.getDocument().lines).toEqual([
      ['a1', '<main>'],
      ['a2', '  <h1>Hello</h1>'],
      ['a3', '</main>'],
    ])

    const nextHtml = store.get().replace('  <h1>Hello</h1>', '  <h1>Hi</h1>')
    expect(store.set(nextHtml)).toBe(
      Buffer.byteLength('<main>\n  <h1>Hi</h1>\n</main>\n', 'utf8'),
    )
    expect(store.get()).toBe('<main>\n  <h1>Hi</h1>\n</main>\n')
  })

  it('defensively clones documents returned from getDocument', () => {
    const store = createHtmlStore('<main>Stable</main>')
    const document = store.getDocument()
    document.lines[0]![1] = '<main>Mutated externally</main>'

    expect(store.get()).toBe('<main>Stable</main>')
  })

  it('resets and whole-document set replace the anchored document', () => {
    const store = createHtmlStore('<main>Old</main>')

    store.set('<main>New</main>')
    expect(store.get()).toBe('<main>New</main>')
    expect(store.getDocument().lines).toEqual([['a1', '<main>New</main>']])

    store.reset()
    expect(store.get()).toBe(PLACEHOLDER_INDEX_HTML)
  })
})
