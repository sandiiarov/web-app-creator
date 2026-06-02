import { describe, expect, it } from 'vitest'

import { errorMessage } from './tool-result'

describe('errorMessage', () => {
  it('returns Error messages', () => {
    expect(errorMessage(new Error('Boom'))).toBe('Boom')
  })

  it('returns a stable fallback for unknown thrown values', () => {
    expect(errorMessage('Boom')).toBe('Failed to update preview.')
    expect(errorMessage(null)).toBe('Failed to update preview.')
  })
})
