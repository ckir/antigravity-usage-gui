import { useQuery } from '@tanstack/react-query'
import { getQuota, type QuotaMethod } from '../../src-tauri/commands/quota'

/** Quota cache TTL: 5 minutes, matching the CLI cache (GlobalConstraints). */
export const QUOTA_STALE_MS = 5 * 60 * 1000

export const quotaKeys = {
  all: ['quota'] as const,
  quota: (method: QuotaMethod, refresh: boolean) =>
    ['quota', method, refresh] as const,
}

export function useQuota(method: QuotaMethod = 'auto', refresh = false) {
  return useQuery({
    queryKey: quotaKeys.quota(method, refresh),
    queryFn: () => getQuota({ method, refresh }),
    staleTime: QUOTA_STALE_MS,
  })
}
