import { invoke } from '@tauri-apps/api/core'
import type { QuotaSnapshot } from '../../src-core/quota/types'

export type QuotaMethod = 'auto' | 'local' | 'google'

export interface AllAccountsQuotaResult {
  email: string
  isActive: boolean
  status: 'success' | 'cached' | 'error'
  snapshot?: QuotaSnapshot
  error?: string
  cacheAge?: number
}

export async function getQuota(args: {
  method?: QuotaMethod
  account?: string
  refresh?: boolean
  allModels?: boolean
}): Promise<QuotaSnapshot> {
  return invoke('get_quota', args)
}

export async function getAllQuotas(refresh = false): Promise<AllAccountsQuotaResult[]> {
  return invoke('get_all_quotas', { refresh })
}
