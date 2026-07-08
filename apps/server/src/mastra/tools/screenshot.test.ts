import { describe, expect, it } from 'vitest'

import { recoverScreenshotArgs } from './screenshot.ts'

describe('recoverScreenshotArgs', () => {
  it('passes a clean typed object through untouched', () => {
    const clean = {
      action: 'check hero',
      selector: '#hero',
      viewportSize: 'mobile',
    }
    expect(recoverScreenshotArgs(clean)).toEqual(clean)
  })

  it('recovers selector + viewportSize from GLM arg_key/arg_value mangled JSON', () => {
    // Real shape observed from GLM-5.2 streaming: the intended
    // {"selector":"#","viewportSize":"mobile"} collapses into one mangled key.
    const mangled = {
      'selector</arg_key>="#"</arg_value><arg_key>viewportSize': 'mobile',
    }
    expect(recoverScreenshotArgs(mangled)).toEqual({
      selector: '#',
      viewportSize: 'mobile',
    })
  })

  it('parses a JSON string the model sent in place of an object', () => {
    expect(
      recoverScreenshotArgs('{"selector":"main","viewportSize":"desktop"}'),
    ).toEqual({ selector: 'main', viewportSize: 'desktop' })
  })

  it('extracts selector and viewportSize from a raw arg_key tagged string', () => {
    const tagged =
      '<arg_key>selector</arg_key><arg_value>.pricing</arg_value><arg_key>viewportSize</arg_key><arg_value>tablet</arg_value>'
    expect(recoverScreenshotArgs(tagged)).toEqual({
      selector: '.pricing',
      viewportSize: 'tablet',
    })
  })

  it('recovers an action string when present', () => {
    const mangled = {
      'action</arg_key>="check spacing"</arg_value><arg_key>viewportSize':
        'desktop',
    }
    expect(recoverScreenshotArgs(mangled)).toEqual({
      action: 'check spacing',
      viewportSize: 'desktop',
    })
  })

  it('returns an empty object when nothing recognizable is present', () => {
    expect(recoverScreenshotArgs({ frobnicate: 42 })).toEqual({})
  })
})
