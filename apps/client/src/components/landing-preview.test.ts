import { describe, expect, it } from 'vitest'

import { preparePreviewSrcDoc } from '../lib/preview-srcdoc'

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
