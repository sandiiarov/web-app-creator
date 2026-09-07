import { describe, expect, it } from 'vitest'

import { resizePanelHeight } from './panel-height'

describe('floating panel height', () => {
  it('resizes the bottom while keeping the top fixed', () => {
    expect(resizePanelHeight('bottom', 100, 360, 120, 900)).toEqual({
      height: 480,
      top: 100,
    })
  })
  it('resizes the top while keeping the bottom fixed', () => {
    expect(resizePanelHeight('top', 300, 360, -120, 900)).toEqual({
      height: 480,
      top: 180,
    })
  })
  it('bounds both edges to the viewport', () => {
    expect(resizePanelHeight('bottom', 100, 360, 1000, 900)).toEqual({
      height: 800,
      top: 100,
    })
    expect(resizePanelHeight('top', 300, 360, -1000, 900)).toEqual({
      height: 660,
      top: 0,
    })
  })
  it('keeps the composer usable at the minimum height', () => {
    expect(resizePanelHeight('bottom', 100, 360, -1000, 900)).toEqual({
      height: 240,
      top: 100,
    })
    expect(resizePanelHeight('top', 100, 360, 1000, 900)).toEqual({
      height: 240,
      top: 220,
    })
  })
  it('fits a viewport smaller than the preferred minimum', () => {
    expect(resizePanelHeight('bottom', 0, 360, 100, 180)).toEqual({
      height: 180,
      top: 0,
    })
  })
  it('can reserve the dock origin while pinning the opposite edge', () => {
    expect(resizePanelHeight('top', 300, 360, -1000, 900, 1)).toEqual({
      height: 659,
      top: 1,
    })
  })
})
