import { describe, it, expect } from 'vitest'
import type { QuotaSnapshot } from './types'

describe('vendored quota types', () => {
  it('accepts a minimal snapshot', () => {
    const s: QuotaSnapshot = {
      timestamp: new Date().toISOString(),
      method: 'local',
      models: [{ label: 'Claude Sonnet', modelId: 'claude-sonnet-4-5', isExhausted: false, remainingPercentage: 78 }]
    }
    expect(s.models[0].modelId).toBe('claude-sonnet-4-5')
  })
})
