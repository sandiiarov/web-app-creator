import { describe, expect, it } from 'vitest'

import {
  getScriptSignature,
  preparePreviewMorphHtml,
  shouldRerunScriptsAfterMorph,
} from './preview-morph'
import { preparePreviewSrcDoc } from './preview-srcdoc'

describe('preparePreviewSrcDoc', () => {
  it('injects an about:srcdoc base tag into the head without changing source HTML upstream', () => {
    const html =
      '<!doctype html><html><head><title>x</title></head><body><a href="#play">Play</a><section id="play"></section></body></html>'
    const prepared = preparePreviewSrcDoc(html)

    expect(prepared).toContain(
      '<head>\n    <base href="about:srcdoc" data-preview-base="true" />',
    )
    expect(prepared).toContain('<a href="#play">Play</a>')
    expect(new URL('#play', 'about:srcdoc').href).toBe('about:srcdoc#play')
  })

  it('does not inject the preview base twice', () => {
    const once = preparePreviewSrcDoc('<html><head></head><body></body></html>')
    const twice = preparePreviewSrcDoc(once)

    expect(twice.match(/data-preview-base="true"/g)).toHaveLength(1)
  })
})

describe('preview morph helpers', () => {
  it('prepares morph target HTML with the same client-only base tag as srcDoc rendering', () => {
    const html =
      '<!doctype html><html><head><title>x</title></head><body><a href="#play">Play</a></body></html>'

    expect(preparePreviewMorphHtml(html)).toBe(preparePreviewSrcDoc(html))
    expect(preparePreviewMorphHtml(html)).toContain('data-preview-base="true"')
  })

  it('detects changed executable script signatures', () => {
    const before =
      '<html><body><main>Hi</main><script type="module">window.count = 1</script></body></html>'
    const afterMarkupOnly =
      '<html><body><main>Hello</main><script type="module">window.count = 1</script></body></html>'
    const afterScript =
      '<html><body><main>Hello</main><script type="module">window.count = 2</script></body></html>'

    expect(getScriptSignature(before)).toContain('window.count = 1')
    expect(shouldRerunScriptsAfterMorph(before, afterMarkupOnly)).toBe(false)
    expect(shouldRerunScriptsAfterMorph(before, afterScript)).toBe(true)
  })
})
