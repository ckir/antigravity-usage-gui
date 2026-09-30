import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isModelUnused, findUnusedModels, hasUnusedModels, detectResetAndTrigger } from './reset-detector'
import { updateResetState } from './storage'
import { executeTrigger } from './trigger-service'
import type { QuotaSnapshot, ModelQuotaInfo } from '../quota/types'

vi.mock('./storage', () => ({
  loadWakeupConfig: () => ({
    enabled: true,
    selectedModels: ['gemini-3-flash'],
    selectedAccounts: undefined,
    customPrompt: undefined,
    maxOutputTokens: 1,
    scheduleMode: 'interval',
    intervalHours: 6,
    dailyTimes: ['09:00'],
    weeklySchedule: {},
    cronExpression: undefined,
    wakeOnReset: false,
    resetCooldownMinutes: 10,
  }),
  loadResetState: () => ({
    'gemini-3-flash': {
      lastResetAt: new Date().toISOString(),
      lastTriggeredTime: new Date().toISOString(),
    },
  }),
  updateResetState: vi.fn(),
}))

vi.mock('../accounts/manager', () => ({
  getAccountManager: () => ({
    getAccountEmails: () => ['a@x.com'],
    getAccountStatus: () => 'valid',
  }),
}))

vi.mock('./trigger-service', () => ({
  executeTrigger: vi.fn(async () => ({ success: true, results: [] })),
}))

const HOUR_MS = 60 * 60 * 1000

function model(overrides: Partial<ModelQuotaInfo> = {}): ModelQuotaInfo {
  return {
    label: 'Gemini Flash',
    modelId: 'gemini-3-flash',
    isExhausted: false,
    remainingPercentage: 100,
    resetTime: new Date(Date.now() + 5 * HOUR_MS).toISOString(),
    timeUntilResetMs: 5 * HOUR_MS,
    ...overrides,
  }
}

function snapshot(models: ModelQuotaInfo[]): QuotaSnapshot {
  return { timestamp: new Date().toISOString(), method: 'google', models }
}

describe('reset detector smart trigger', () => {
  it('treats a full model with ~5h reset as unused', () => {
    expect(isModelUnused(model())).toBe(true)
  })

  it('treats the 99% boundary as full', () => {
    expect(isModelUnused(model({ remainingPercentage: 99 }))).toBe(true)
  })

  it('ignores models below the full-quota threshold', () => {
    expect(isModelUnused(model({ remainingPercentage: 50 }))).toBe(false)
  })

  it('ignores models outside the 4.5-5.5h reset window', () => {
    expect(isModelUnused(model({ timeUntilResetMs: 1 * HOUR_MS }))).toBe(false)
    expect(isModelUnused(model({ timeUntilResetMs: 8 * HOUR_MS }))).toBe(false)
  })

  it('ignores models without quota data', () => {
    expect(isModelUnused(model({ remainingPercentage: undefined }))).toBe(false)
    expect(isModelUnused(model({ timeUntilResetMs: undefined }))).toBe(false)
  })

  it('finds unused models in a snapshot', () => {
    const s = snapshot([
      model({ modelId: 'gemini-3-flash' }),
      model({ modelId: 'claude-sonnet-4-5', remainingPercentage: 20 }),
    ])
    expect(findUnusedModels(s).map((m) => m.modelId)).toEqual(['gemini-3-flash'])
  })

  it('reports whether any model needs triggering', () => {
    expect(hasUnusedModels(snapshot([model()]))).toBe(true)
    expect(hasUnusedModels(snapshot([model({ remainingPercentage: 10 })]))).toBe(false)
    expect(hasUnusedModels(snapshot([]))).toBe(false)
  })
})

describe('detectResetAndTrigger cooldown override', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.mocked(executeTrigger).mockClear()
    vi.mocked(updateResetState).mockClear()
  })

  afterEach(() => {
    vi.mocked(console.log).mockRestore()
  })

  it('skips a recently triggered model under the default 1h cooldown', async () => {
    const result = await detectResetAndTrigger(snapshot([model({ modelId: 'gemini-3-flash' })]))
    expect(result).toEqual({ triggered: false, triggeredModels: [] })
    expect(executeTrigger).not.toHaveBeenCalled()
  })

  it('wires the config cooldown through via the override (0 = trigger now)', async () => {
    const result = await detectResetAndTrigger(snapshot([model({ modelId: 'gemini-3-flash' })]), 0)
    expect(result.triggered).toBe(true)
    expect(result.triggeredModels).toEqual(['gemini-3-flash'])
    expect(executeTrigger).toHaveBeenCalledTimes(1)
    expect(updateResetState).toHaveBeenCalledWith('gemini-3-flash', expect.any(String))
  })
})
