import { describe, expect, it, vi } from 'vitest'

import type { CapturedProjectSelector } from '../lib/project-screenshot.ts'
import {
  createScreenshotTool,
  recoverScreenshotArgs,
  type RequestProjectScreenshot,
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
    imagesAnalyzed: 3,
    ok: true,
    text: 'transcript',
    usage: null,
  })),
}))

function makeCapturedSelector(selector: string): CapturedProjectSelector {
  return {
    captures: [
      {
        dataUrl: 'data:image/jpeg;base64,/9j/4AAQ',
        elementMap: '0 link "Start" @10,20 100×40',
        height: 422,
        imageUrl: `/api/projects/project-1/screenshots/001-${selector}-mobile.jpg`,
        mediaType: 'image/jpeg',
        viewport: 'mobile',
        width: 195,
      },
      {
        dataUrl: 'data:image/jpeg;base64,/9j/4AAQ',
        elementMap: '0 link "Start" @10,20 100×40',
        height: 512,
        imageUrl: `/api/projects/project-1/screenshots/002-${selector}-tablet.jpg`,
        mediaType: 'image/jpeg',
        viewport: 'tablet',
        width: 384,
      },
      {
        dataUrl: 'data:image/jpeg;base64,/9j/4AAQ',
        elementMap: '0 link "Start" @10,20 100×40',
        height: 450,
        imageUrl: `/api/projects/project-1/screenshots/003-${selector}-desktop.jpg`,
        mediaType: 'image/jpeg',
        viewport: 'desktop',
        width: 720,
      },
    ],
    selector,
  }
}

describe('recoverScreenshotArgs', () => {
  it('passes a clean typed object through untouched', () => {
    const clean = { action: 'check hero', selector: '#hero' }
    expect(recoverScreenshotArgs(clean)).toEqual(clean)
  })

  it('recovers selector from GLM arg_key/arg_value mangled JSON', () => {
    const mangled = {
      'selector</arg_key>="#"</arg_value><arg_key>viewportSize': 'mobile',
    }
    expect(recoverScreenshotArgs(mangled)).toEqual({ selector: '#' })
  })

  it('parses a JSON string the model sent in place of an object', () => {
    expect(recoverScreenshotArgs('{"selector":"main"}')).toEqual({
      selector: 'main',
    })
  })

  it('extracts selector from a raw arg_key tagged string', () => {
    const tagged = '<arg_key>selector</arg_key><arg_value>.pricing</arg_value>'
    expect(recoverScreenshotArgs(tagged)).toEqual({ selector: '.pricing' })
  })

  it('recovers an action string when present', () => {
    const mangled = {
      'action</arg_key>="check spacing"</arg_value>': '',
    }
    expect(recoverScreenshotArgs(mangled)).toEqual({ action: 'check spacing' })
  })

  it('returns an empty object when nothing recognizable is present', () => {
    expect(recoverScreenshotArgs({ frobnicate: 42 })).toEqual({})
  })
})

describe('createScreenshotTool execute', () => {
  it('returns three captures with safe URLs on a successful screenshot', async () => {
    const capture = vi.fn<RequestProjectScreenshot>(async (selector) =>
      makeCapturedSelector(selector),
    )
    const tool = createScreenshotTool(capture, 'test-vision-model')
    const res = (await tool.execute?.(
      { selector: 'main' },
      undefined as never,
    )) as {
      captures: { imageUrl: string; viewport: string }[]
      imageOcr: { imagesAnalyzed: number }
      ok: boolean
      selector: string
      text: string
    }

    expect(res.ok).toBe(true)
    expect(res.selector).toBe('main')
    expect(res.captures).toHaveLength(3)
    expect(res.captures.map((c) => c.viewport)).toEqual([
      'mobile',
      'tablet',
      'desktop',
    ])
    expect(res.imageOcr.imagesAnalyzed).toBe(3)
    expect(res.text).toBe('transcript')
    for (const capture of res.captures) {
      expect(capture.imageUrl).toMatch(
        /^\/api\/projects\/project-1\/screenshots\//,
      )
    }
    expect(JSON.stringify(res)).not.toContain('data:image/jpeg')
  })

  it('returns an empty captures array when selector is missing', async () => {
    const capture = vi.fn<RequestProjectScreenshot>(async (selector) =>
      makeCapturedSelector(selector),
    )
    const tool = createScreenshotTool(capture, 'test-vision-model')
    const res = (await tool.execute?.({}, undefined as never)) as {
      captures: unknown[]
      ok: boolean
    }
    expect(res.ok).toBe(false)
    expect(res.captures).toEqual([])
  })

  it('returns an empty captures array when no capture callback is wired', async () => {
    const tool = createScreenshotTool(undefined, 'test-vision-model')
    const res = (await tool.execute?.(
      { selector: 'main' },
      undefined as never,
    )) as { captures: unknown[]; ok: boolean }
    expect(res.ok).toBe(false)
    expect(res.captures).toEqual([])
  })

  it('returns an empty captures array when capture throws', async () => {
    const capture = vi.fn<RequestProjectScreenshot>(async () => {
      throw new Error('capture failed')
    })
    const tool = createScreenshotTool(capture, 'test-vision-model')
    const res = (await tool.execute?.(
      { selector: 'main' },
      undefined as never,
    )) as { captures: unknown[]; ok: boolean; reason: string }
    expect(res.ok).toBe(false)
    expect(res.captures).toEqual([])
    expect(res.reason).toBe('capture failed')
  })
})
