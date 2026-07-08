import { describe, expect, it } from 'vitest'

import {
  ELEMENT_CAPTURE_PADDING_PX,
  getPaddedScreenshotSize,
  getScreenshotViewportDimensions,
  SCREENSHOT_VIEWPORT_SIZES,
} from './browser-screenshot'
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

  it('closes an unclosed <style> before <body> so body content is not parsed into the head', () => {
    const html =
      '<!doctype html><html><head><style>body{color:red}</head><body><main>Hi</main></body></html>'
    const repaired = preparePreviewSrcDoc(html)
    const open = (repaired.match(/<style\b/gi) ?? []).length
    const close = (repaired.match(/<\/style\s*>/gi) ?? []).length

    expect(open).toBe(close)
    expect(repaired.indexOf('</style>')).toBeLessThan(repaired.indexOf('<body'))
    expect(repaired).toContain('<main>Hi</main>')
  })

  it('leaves already-balanced <style> blocks untouched', () => {
    const html =
      '<!doctype html><html><head><style>body{color:red}</style></head><body><main>Hi</main></body></html>'
    const repaired = preparePreviewSrcDoc(html)

    expect((repaired.match(/<\/style\s*>/gi) ?? []).length).toBe(1)
  })

  it('closes multiple unclosed <style> tags before <body>', () => {
    const html =
      '<html><head><style>a{}<style>b{}</head><body><main>Hi</main></body></html>'
    const repaired = preparePreviewSrcDoc(html)
    const open = (repaired.match(/<style\b/gi) ?? []).length
    const close = (repaired.match(/<\/style\s*>/gi) ?? []).length

    expect(open).toBe(close)
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

describe('screenshot helpers', () => {
  it('exposes the supported viewport sizes', () => {
    expect(SCREENSHOT_VIEWPORT_SIZES).toEqual(['mobile', 'tablet', 'desktop'])
  })

  it('returns fixed dimensions for each screenshot viewport', () => {
    expect(getScreenshotViewportDimensions('mobile')).toEqual({
      height: 844,
      width: 390,
    })
    expect(getScreenshotViewportDimensions('tablet')).toEqual({
      height: 1024,
      width: 768,
    })
    expect(getScreenshotViewportDimensions('desktop')).toEqual({
      height: 900,
      width: 1440,
    })
  })

  it('pads element screenshot sizes by the capture padding on all sides', () => {
    expect(getPaddedScreenshotSize({ height: 100, width: 50 })).toEqual({
      height: 100 + ELEMENT_CAPTURE_PADDING_PX * 2,
      width: 50 + ELEMENT_CAPTURE_PADDING_PX * 2,
    })
  })

  it('supports a custom padding override', () => {
    expect(getPaddedScreenshotSize({ height: 10, width: 10 }, 4)).toEqual({
      height: 18,
      width: 18,
    })
  })
})
