import { describe, it, expect } from 'vitest'
import { isModelUnused, findUnusedModels, hasUnusedModels } from './reset-detector'
import type { QuotaSnapshot, ModelQuotaInfo } from '../quota/types'

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
