import { describe, expect, it, vi } from 'vitest'

import type { BrowserScreenshotResult } from '../lib/browser-screenshot.ts'
import {
  createScreenshotTool,
  recoverScreenshotArgs,
  type RequestBrowserScreenshot,
} from './screenshot.ts'

vi.mock('../lib/image-ocr.ts', () => ({
  ocrImageInputs: vi.fn<
    () => Promise<{
      imagesAnalyzed: number
      ok: boolean
      text: string
      usage: null
    }>
  >(async () => ({
    imagesAnalyzed: 1,
    ok: true,
    text: 'transcript',
    usage: null,
  })),
}))

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

describe('createScreenshotTool execute — elementMap', () => {
  const stubScreenshot: BrowserScreenshotResult = {
    dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
    elementMap: '0 link "Start subscription" @10,20 100×40',
    height: 800,
    mediaType: 'image/jpeg',
    width: 1200,
  }

  it('forwards the captured elementMap on a successful screenshot', async () => {
    const requestScreenshot = vi.fn<RequestBrowserScreenshot>(
      async () => stubScreenshot,
    )
    const tool = createScreenshotTool(requestScreenshot, 'test-vision-model')
    const res = (await tool.execute?.(
      { selector: 'main', viewportSize: 'desktop' },
      undefined as never,
    )) as { elementMap: string; ok: boolean }

    expect(res.ok).toBe(true)
    expect(res.elementMap).toBe('0 link "Start subscription" @10,20 100×40')
  })

  it('returns an empty elementMap when selector/viewportSize are missing', async () => {
    const requestScreenshot = vi.fn<RequestBrowserScreenshot>(
      async () => stubScreenshot,
    )
    const tool = createScreenshotTool(requestScreenshot, 'test-vision-model')
    const res = (await tool.execute?.({}, undefined as never)) as {
      elementMap: string
    }
    expect(res.elementMap).toBe('')
  })

  it('returns an empty elementMap when no requestScreenshot is wired', async () => {
    const tool = createScreenshotTool(undefined, 'test-vision-model')
    const res = (await tool.execute?.(
      { selector: 'main', viewportSize: 'desktop' },
      undefined as never,
    )) as { elementMap: string }
    expect(res.elementMap).toBe('')
  })

  it('returns an empty elementMap when capture throws', async () => {
    const requestScreenshot = vi.fn<RequestBrowserScreenshot>(async () => {
      throw new Error('capture failed')
    })
    const tool = createScreenshotTool(requestScreenshot, 'test-vision-model')
    const res = (await tool.execute?.(
      { selector: 'main', viewportSize: 'desktop' },
      undefined as never,
    )) as { elementMap: string; ok: boolean }
    expect(res.ok).toBe(false)
    expect(res.elementMap).toBe('')
  })
})
