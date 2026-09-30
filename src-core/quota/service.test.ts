import { describe, it, expect } from 'vitest'
import { isCacheValid } from '../accounts/cache'

describe('quota cache rule', () => {
  it('treats fresh cache as valid within 5 minutes', () => {
    expect(isCacheValid('x@y.com', Date.now() - 4 * 60 * 1000)).toBe(true)
  })
  it('treats stale cache as invalid after 5 minutes', () => {
    expect(isCacheValid('x@y.com', Date.now() - 6 * 60 * 1000)).toBe(false)
  })
})
