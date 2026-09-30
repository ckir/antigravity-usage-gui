import { describe, it, expect, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args?: Record<string, unknown>) => ({ cmd, args })),
}))

import { invoke } from '@tauri-apps/api/core'
import { getQuota, getAllQuotas } from '../../src-tauri/commands/quota'
import { QUOTA_STALE_MS, quotaKeys } from './useQuota'

describe('quota IPC bridge', () => {
  it('getQuota invokes get_quota with method/account/refresh args', async () => {
    await getQuota({ method: 'google', account: 'a@x.com', refresh: true })
    expect(invoke).toHaveBeenCalledWith('get_quota', {
      method: 'google',
      account: 'a@x.com',
      refresh: true,
    })
  })

  it('getAllQuotas invokes get_all_quotas with refresh flag', async () => {
    await getAllQuotas(true)
    expect(invoke).toHaveBeenCalledWith('get_all_quotas', { refresh: true })
  })
})

describe('useQuota cache contract', () => {
  it('uses a 5-minute stale time matching the CLI cache TTL', () => {
    expect(QUOTA_STALE_MS).toBe(5 * 60 * 1000)
  })

  it('builds stable query keys per method/refresh', () => {
    expect(quotaKeys.quota('auto', false)).toEqual(['quota', 'auto', false])
    expect(quotaKeys.quota('google', true)).toEqual(['quota', 'google', true])
  })
})
