import { describe, it, expect } from 'vitest'
import { toDisplayPercent, quotaBarColor, formatResetCountdown } from './QuotaCard'

describe('QuotaCard unit boundary', () => {
  it('normalizes upstream 0-1 fractions to 0-100 percent', () => {
    expect(toDisplayPercent(0.78)).toBeCloseTo(78)
    expect(toDisplayPercent(0)).toBe(0)
    expect(toDisplayPercent(1)).toBe(100)
  })

  it('passes through values already on the 0-100 scale', () => {
    expect(toDisplayPercent(78)).toBe(78)
    expect(toDisplayPercent(undefined)).toBe(undefined)
  })

  it('colors fraction inputs on the percent thresholds', () => {
    expect(quotaBarColor(0.78)).toBe('bg-green-500')
    expect(quotaBarColor(0.3)).toBe('bg-amber-500')
    expect(quotaBarColor(0.05)).toBe('bg-red-500')
    expect(quotaBarColor(undefined)).toBe('bg-gray-400')
  })

  it('formats reset countdowns', () => {
    expect(formatResetCountdown(3.5 * 3600 * 1000)).toBe('3h 30m')
    expect(formatResetCountdown(90 * 1000)).toBe('1m 30s')
    expect(formatResetCountdown(undefined)).toBe('—')
  })
})
