import type { AgentMapEntry } from '@zumer/snapdom-plugins/agent-map'
import { describe, expect, it } from 'vitest'

import {
  ELEMENT_CAPTURE_PADDING_PX,
  fitScreenshotSize,
  formatElementMap,
  getPaddedScreenshotSize,
} from './browser-screenshot.ts'

describe('fitScreenshotSize', () => {
  it('leaves small elements untouched', () => {
    const targetSize = { height: 600, width: 800 }
    expect(fitScreenshotSize(targetSize)).toEqual({
      paddedSize: getPaddedScreenshotSize(targetSize),
      targetSize,
    })
  })

  it('downscales a tall element so the longest padded side fits the cap', () => {
    // Real failure case: a 1456x7629 element used to throw "too large".
    const { paddedSize, targetSize } = fitScreenshotSize({
      height: 7629,
      width: 1456,
    })
    expect(Math.max(paddedSize.width, paddedSize.height)).toBeLessThanOrEqual(
      4096,
    )
    // aspect ratio preserved (within rounding)
    expect(targetSize.width / targetSize.height).toBeCloseTo(1456 / 7629, 2)
    // padded size wraps the (scaled) target size with padding on both sides
    expect(paddedSize).toEqual(getPaddedScreenshotSize(targetSize))
  })

  it('keeps the 1:1 element under the cap unscaled', () => {
    const { paddedSize, targetSize } = fitScreenshotSize({
      height: 4080,
      width: 4080,
    })
    // 4080 + 2*padding = 4096 (== cap) -> no scaling needed
    expect(targetSize).toEqual({ height: 4080, width: 4080 })
    expect(paddedSize.height).toBe(4080 + ELEMENT_CAPTURE_PADDING_PX * 2)
  })

  it('never returns a zero-size target for huge inputs', () => {
    const { targetSize } = fitScreenshotSize({ height: 100_000, width: 10 })
    expect(targetSize.height).toBeGreaterThanOrEqual(1)
    expect(targetSize.width).toBeGreaterThanOrEqual(1)
  })
})

describe('formatElementMap', () => {
  const entry = (over: Partial<AgentMapEntry> = {}): AgentMapEntry => ({
    b: [10, 20, 100, 40],
    i: over.i ?? 0,
    n: over.n ?? '',
    r: over.r ?? 'link',
    ...over,
  })

  it('returns empty string for undefined or empty map', () => {
    expect(formatElementMap(undefined)).toBe('')
    expect(formatElementMap([])).toBe('')
  })

  it('formats a named interactive element with bbox', () => {
    expect(
      formatElementMap([
        entry({
          b: [120, 340, 180, 44],
          i: 0,
          n: 'Start subscription',
          r: 'link',
        }),
      ]),
    ).toBe('0 link "Start subscription" @120,340 180×44')
  })

  it('omits the quoted name when the element has no accessible name', () => {
    expect(formatElementMap([entry({ i: 2, n: '', r: 'button' })])).toBe(
      '2 button @10,20 100×40',
    )
  })

  it('appends meaningful state as key=value pairs', () => {
    expect(
      formatElementMap([
        entry({
          i: 1,
          n: 'Subscribe',
          r: 'button',
          s: { pressed: false },
        }),
      ]),
    ).toBe('1 button "Subscribe" @10,20 100×40 pressed=false')
  })

  it('joins multiple entries with newlines', () => {
    const out = formatElementMap([
      entry({ i: 0, n: 'Home', r: 'link' }),
      entry({ b: [0, 50, 60, 20], i: 1, n: 'Pricing', r: 'link' }),
    ])
    expect(out).toBe(
      '0 link "Home" @10,20 100×40\n1 link "Pricing" @0,50 60×20',
    )
  })
})
