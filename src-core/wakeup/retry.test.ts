import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { executeWithBackoff, backoffDelayMs, resolveCooldownMs } from './retry'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('backoff delays', () => {
  it('grows exponentially from the base delay', () => {
    expect(backoffDelayMs(1, 1000, 2)).toBe(1000)
    expect(backoffDelayMs(2, 1000, 2)).toBe(2000)
    expect(backoffDelayMs(3, 1000, 2)).toBe(4000)
  })
})

describe('executeWithBackoff', () => {
  it('resolves on the first attempt without waiting', async () => {
    const fn = vi.fn(async () => 'ok')
    await expect(executeWithBackoff(fn)).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('makes 3 attempts with growing delays (1000ms, then 2000ms)', async () => {
    const fn = vi.fn(async () => {
      throw new Error('transient')
    })
    const pending = executeWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 1000, factor: 2 })
    const assertion = expect(pending).rejects.toThrow('transient')

    expect(fn).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(999)
    expect(fn).toHaveBeenCalledTimes(1) // still inside the first 1000ms delay
    await vi.advanceTimersByTimeAsync(1)
    expect(fn).toHaveBeenCalledTimes(2) // second attempt fired
    await vi.advanceTimersByTimeAsync(1999)
    expect(fn).toHaveBeenCalledTimes(2) // still inside the 2000ms delay
    await vi.advanceTimersByTimeAsync(1)
    expect(fn).toHaveBeenCalledTimes(3) // third and final attempt

    await assertion
  })

  it('returns success-on-retry', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('flaky')).mockResolvedValue('fine')
    const pending = executeWithBackoff(fn)
    await vi.advanceTimersByTimeAsync(1000)
    await expect(pending).resolves.toBe('fine')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('attempts once when maxAttempts is 1', async () => {
    const fn = vi.fn(async () => {
      throw new Error('nope')
    })
    await expect(executeWithBackoff(fn, { maxAttempts: 1 })).rejects.toThrow('nope')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('stops early when shouldRetry returns false', async () => {
    const fn = vi.fn(async () => {
      throw new Error('fatal')
    })
    await expect(executeWithBackoff(fn, { shouldRetry: () => false })).rejects.toThrow('fatal')
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('resolveCooldownMs', () => {
  it('maps config minutes to detector milliseconds', () => {
    expect(resolveCooldownMs(10)).toBe(600_000)
  })

  it('preserves the 1h upstream default when absent', () => {
    expect(resolveCooldownMs(undefined)).toBe(3_600_000)
    expect(resolveCooldownMs()).toBe(3_600_000)
  })
})
