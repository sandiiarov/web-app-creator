import { describe, expect, it } from 'vitest'

import {
  ELEMENT_CAPTURE_PADDING_PX,
  fitScreenshotSize,
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
