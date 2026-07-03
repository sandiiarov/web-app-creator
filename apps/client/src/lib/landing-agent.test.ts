import { describe, expect, it } from 'vitest'

import { formatCost, formatRetryDelay, formatTokenCount } from './landing-agent'

describe('formatCost', () => {
  it('formats exact zero as zero, not less than a cent', () => {
    expect(formatCost(0)).toBe('$0')
  })

  it('formats tiny positive provider-reported costs as less than a cent', () => {
    expect(formatCost(0.004)).toBe('<$0.01')
  })

  it('formats costs at or above one cent with four decimals', () => {
    expect(formatCost(0.01)).toBe('$0.0100')
    expect(formatCost(1.23456)).toBe('$1.2346')
  })
})

describe('formatRetryDelay', () => {
  it('formats live retry countdown values', () => {
    expect(formatRetryDelay(0)).toBe('now')
    expect(formatRetryDelay(950)).toBe('0.9s')
    expect(formatRetryDelay(2500)).toBe('2.5s')
    expect(formatRetryDelay(12_000)).toBe('12s')
  })
})

describe('formatTokenCount', () => {
  it('compacts large token counts', () => {
    expect(formatTokenCount(217544)).toBe('218k')
  })
})
