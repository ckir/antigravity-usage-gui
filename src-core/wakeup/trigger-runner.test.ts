import { describe, it, expect, vi } from 'vitest'
vi.mock('./reset-detector', () => ({
  detectResetAndTrigger: vi.fn(async () => ({ triggered: true, triggeredModels: ['gemini-3-flash'] })),
}))
import { detectResetAndTrigger } from './reset-detector'
import { runScheduledTrigger } from './trigger-runner'
import { getDefaultConfig } from './types'
import type { QuotaSnapshot } from '../quota/types'

function snapshot(): QuotaSnapshot {
  return { timestamp: new Date().toISOString(), method: 'google', models: [] }
}

describe('trigger runner cooldown flow', () => {
  it('passes a config cooldownMinutes=10 to the detector as 10min in ms', async () => {
    const config = { ...getDefaultConfig(), cooldownMinutes: 10 }
    const snap = snapshot()
    const result = await runScheduledTrigger(config, snap)
    expect(result.triggered).toBe(true)
    expect(detectResetAndTrigger).toHaveBeenCalledWith(snap, 600_000)
  })

  it('preserves the 1h default when the cooldown field is absent', async () => {
    // Field undefined behaves as absent via ?? (simulates a legacy config).
    const config = { ...getDefaultConfig(), resetCooldownMinutes: undefined as unknown as number }
    const snap = snapshot()
    await runScheduledTrigger(config, snap)
    expect(detectResetAndTrigger).toHaveBeenCalledWith(snap, 3_600_000)
  })
})
