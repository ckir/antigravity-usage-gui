// src/hooks/useAutoRefresh.test.ts
import { describe, it, expect } from 'vitest'
import { refreshIntervalMs, quotaStaleMs } from './useAutoRefresh'

describe('auto refresh', () => {
  it('polls every 60s', () => {
    expect(refreshIntervalMs).toBe(60_000)
  })

  it('keeps the 5-minute quota stale time matching the CLI cache TTL', () => {
    expect(quotaStaleMs).toBe(5 * 60 * 1000)
  })
})
