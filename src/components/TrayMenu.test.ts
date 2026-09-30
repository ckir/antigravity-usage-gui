import { describe, it, expect, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => undefined) }))

import { invoke } from '@tauri-apps/api/core'
import {
  lowestQuotaPercent,
  tooltipForSnapshot,
  buildTrayTooltip,
  setTrayTooltip,
} from './TrayMenu'
import type { ModelQuotaInfo } from '../../src-core/quota/types'

function model(id: string, remainingPercentage: number, autocomplete = false): ModelQuotaInfo {
  return {
    label: id,
    modelId: id,
    remainingPercentage,
    isExhausted: remainingPercentage <= 0,
    isAutocompleteOnly: autocomplete,
  }
}

describe('lowestQuotaPercent', () => {
  it('returns the minimum across non-autocomplete models', () => {
    expect(
      lowestQuotaPercent([model('a', 78), model('b', 12), model('c', 55)])
    ).toBe(12)
  })

  it('ignores autocomplete-only models', () => {
    expect(
      lowestQuotaPercent([model('a', 90), model('ac', 3, true)])
    ).toBe(90)
  })

  it('returns null when there is no usable model', () => {
    expect(lowestQuotaPercent([])).toBeNull()
    expect(lowestQuotaPercent([model('ac', 3, true)])).toBeNull()
    expect(
      lowestQuotaPercent([
        { label: 'x', modelId: 'x', isExhausted: false },
      ])
    ).toBeNull()
  })
})

describe('tooltipForSnapshot', () => {
  it('shows the lowest quota % with the account email', () => {
    expect(
      tooltipForSnapshot({
        timestamp: '2026-09-30T00:00:00.000Z',
        method: 'google',
        email: 'a@x.com',
        models: [model('a', 78), model('b', 34)],
      })
    ).toBe('antigravity-usage (a@x.com): 34% left')
  })

  it('falls back when there is no quota data', () => {
    expect(
      tooltipForSnapshot({
        timestamp: '2026-09-30T00:00:00.000Z',
        method: 'google',
        models: [],
      })
    ).toBe('antigravity-usage: no quota data')
  })
})

describe('buildTrayTooltip', () => {
  it('picks the lowest quota across accounts', () => {
    expect(
      buildTrayTooltip([
        {
          email: 'a@x.com',
          isActive: true,
          status: 'success',
          snapshot: {
            timestamp: '2026-09-30T00:00:00.000Z',
            method: 'google',
            models: [model('a', 78)],
          },
        },
        {
          email: 'b@x.com',
          isActive: false,
          status: 'success',
          snapshot: {
            timestamp: '2026-09-30T00:00:00.000Z',
            method: 'google',
            models: [model('a', 12)],
          },
        },
        { email: 'c@x.com', isActive: false, status: 'error', error: 'boom' },
      ])
    ).toBe('antigravity-usage: 12% left (b@x.com)')
  })

  it('falls back when no account has usable data', () => {
    expect(buildTrayTooltip([])).toBe('antigravity-usage: no quota data')
  })
})

describe('setTrayTooltip', () => {
  it('invokes the tray_tooltip handler', async () => {
    await setTrayTooltip('antigravity-usage: 12% left (b@x.com)')
    expect(invoke).toHaveBeenCalledWith('tray_tooltip', {
      tooltip: 'antigravity-usage: 12% left (b@x.com)',
    })
  })
})
