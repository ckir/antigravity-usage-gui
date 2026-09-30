import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { allQuotasKey, quotaKeys } from './useQuota'
import type { QuotaMethod } from '../../src-tauri/commands/quota'

/** Auto-refresh poll interval: 60s (Global Constraints). */
export const refreshIntervalMs = 60_000

/** Quota stale time: 5 minutes, matching the CLI cache TTL. */
export const quotaStaleMs = 5 * 60 * 1000

/**
 * Poll the quota queries every {@link refreshIntervalMs}.
 *
 * Invalidation (not direct refetch) respects the 5-minute stale time:
 * entries still fresh stay cached, stale ones refetch on next render.
 * Disabled by default in tests via `enabled: false`.
 */
export function useAutoRefresh(method: QuotaMethod = 'auto', enabled = true): void {
  const client = useQueryClient()

  useEffect(() => {
    if (!enabled) return
    const timer = setInterval(() => {
      void client.invalidateQueries({ queryKey: quotaKeys.all })
      void client.invalidateQueries({ queryKey: allQuotasKey })
    }, refreshIntervalMs)
    return () => clearInterval(timer)
  }, [client, method, enabled])
}
