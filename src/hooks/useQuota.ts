import { useQuery, type QueryClient } from '@tanstack/react-query'
import { getQuota, getAllQuotas, type QuotaMethod } from '../../src-tauri/commands/quota'

/** Quota cache TTL: 5 minutes, matching the CLI cache (GlobalConstraints). */
export const QUOTA_STALE_MS = 5 * 60 * 1000

export const quotaKeys = {
  all: ['quota'] as const,
  quota: (method: QuotaMethod, refresh: boolean) =>
    ['quota', method, refresh] as const,
}

export const allQuotasKey = ['all-quotas'] as const

export function useQuota(method: QuotaMethod = 'auto', refresh = false) {
  return useQuery({
    queryKey: quotaKeys.quota(method, refresh),
    queryFn: () => getQuota({ method, refresh }),
    staleTime: QUOTA_STALE_MS,
  })
}

/**
 * Force a fresh fetch that bypasses the 5-minute cache (Global Constraints:
 * refresh forces fetch), then writes the results into the cached queries so
 * the Dashboard updates without changing its query keys.
 */
export async function forceRefreshQuotas(
  client: QueryClient,
  method: QuotaMethod = 'auto'
): Promise<void> {
  const [snapshot, all] = await Promise.all([
    getQuota({ method, refresh: true }),
    getAllQuotas(true),
  ])
  client.setQueryData(quotaKeys.quota(method, false), snapshot)
  client.setQueryData(allQuotasKey, all)
}
