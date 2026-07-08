// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'

import { morphPreviewDocument } from './preview-morph'

function makeDoc(html: string): Document {
  const doc = document.implementation.createHTMLDocument('')
  doc.open()
  doc.write(html)
  doc.close()
  return doc
}

const DOC = '<!doctype html><html><head></head><body></body></html>'

describe('morphPreviewDocument', () => {
  it('updates changed text in place', () => {
    const doc = makeDoc(
      `${DOC.replace('<body></body>', '<body><p id="a">old</p></body>')}`,
    )
    morphPreviewDocument(
      doc,
      `${DOC.replace('<body></body>', '<body><p id="a">new</p></body>')}`,
    )

    expect(doc.getElementById('a')?.textContent).toBe('new')
  })

  it('preserves the DOM node identity of an id-matched element', () => {
    const doc = makeDoc(
      `${DOC.replace('<body></body>', '<body><p id="a">old</p></body>')}`,
    )
    const before = doc.getElementById('a')

    morphPreviewDocument(
      doc,
      `${DOC.replace('<body></body>', '<body><p id="a">new</p></body>')}`,
    )

    expect(doc.getElementById('a')).toBe(before)
  })

  it('appends a child present only in the target', () => {
    const doc = makeDoc(
      `${DOC.replace('<body></body>', '<body><main></main></body>')}`,
    )

    morphPreviewDocument(
      doc,
      `${DOC.replace('<body></body>', '<body><main></main><section id="cta">x</section></body>')}`,
    )

    expect(doc.getElementById('cta')).not.toBeNull()
  })

  it('removes a child absent from the target', () => {
    const doc = makeDoc(
      `${DOC.replace('<body></body>', '<body><section id="old">x</section></body>')}`,
    )

    morphPreviewDocument(doc, DOC)

    expect(doc.getElementById('old')).toBeNull()
  })

  it('syncs a changed attribute', () => {
    const doc = makeDoc(
      `${DOC.replace('<body></body>', '<body><div id="d" class="a"></div></body>')}`,
    )

    morphPreviewDocument(
      doc,
      `${DOC.replace('<body></body>', '<body><div id="d" class="a b"></div></body>')}`,
    )

    expect(doc.getElementById('d')?.getAttribute('class')).toBe('a b')
  })
})
