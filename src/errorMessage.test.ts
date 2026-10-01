import { describe, expect, it } from 'vitest'
import { errorMessage } from './errorMessage'

describe('errorMessage', () => {
  it('shows a string rejection from Tauri invoke verbatim', () => {
    expect(errorMessage('failed to spawn node backend (node): not found', 'Failed')).toBe(
      'failed to spawn node backend (node): not found'
    )
  })

  it('uses Error.message', () => {
    expect(errorMessage(new Error('boom'), 'Failed')).toBe('boom')
  })

  it('falls back for empty or non-text rejections', () => {
    expect(errorMessage('  ', 'Failed')).toBe('Failed')
    expect(errorMessage(new Error(''), 'Failed')).toBe('Failed')
    expect(errorMessage(undefined, 'Failed')).toBe('Failed')
    expect(errorMessage({ code: 1 }, 'Failed')).toBe('Failed')
  })
})
