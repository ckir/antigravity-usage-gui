import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useQuota, QUOTA_STALE_MS, allQuotasKey, forceRefreshQuotas } from '../hooks/useQuota'
import { refreshIntervalMs } from '../hooks/useAutoRefresh'
import { buildTrayTooltip, setTrayTooltip } from '../components/TrayMenu'
import { getAllQuotas } from '../../src-tauri/commands/quota'
import QuotaCard from '../components/QuotaCard'
import AccountsTable from '../components/AccountsTable'

export default function Dashboard() {
  const [allModels, setAllModels] = useState(false)
  const [showJson, setShowJson] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const queryClient = useQueryClient()
  const quota = useQuota('auto')
  const allAccounts = useQuery({
    queryKey: allQuotasKey,
    queryFn: () => getAllQuotas(false),
    staleTime: QUOTA_STALE_MS,
    refetchInterval: refreshIntervalMs,
  })

  // Keep the Rust tray tooltip on the lowest quota % across accounts.
  // Best-effort: ignored outside the Tauri runtime (browser/tests).
  useEffect(() => {
    if (allAccounts.data) {
      setTrayTooltip(buildTrayTooltip(allAccounts.data)).catch(() => undefined)
    }
  }, [allAccounts.data])

  const handleRefresh = async (): Promise<void> => {
    setRefreshing(true)
    try {
      await forceRefreshQuotas(queryClient, 'auto')
    } finally {
      setRefreshing(false)
    }
  }

  const snapshot = quota.data
  const visibleModels = (snapshot?.models ?? []).filter(
    (m) => allModels || !m.isAutocompleteOnly
  )

  return (
    <main data-testid="dashboard">
      <header>
        <h1>Quota Dashboard</h1>
        <button
          type="button"
          data-testid="refresh-button"
          disabled={refreshing}
          onClick={() => {
            void handleRefresh()
          }}
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
        <label>
          <input
            type="checkbox"
            data-testid="all-models-toggle"
            checked={allModels}
            onChange={(e) => setAllModels(e.target.checked)}
          />
          All models
        </label>
        <label>
          <input
            type="checkbox"
            data-testid="json-toggle"
            checked={showJson}
            onChange={(e) => setShowJson(e.target.checked)}
          />
          JSON
        </label>
      </header>

      {quota.isLoading && <p data-testid="dashboard-loading">Loading quota…</p>}
      {quota.isError && (
        <p data-testid="dashboard-error">
          {quota.error instanceof Error ? quota.error.message : 'Failed to load quota'}
        </p>
      )}

      {snapshot && (
        <section data-testid="quota-cards">
          {snapshot.promptCredits && (
            <article data-testid="prompt-credits">
              <h2>Prompt credits</h2>
              <p>
                {snapshot.promptCredits.available} / {snapshot.promptCredits.monthly} left
              </p>
            </article>
          )}
          {visibleModels.map((m) => (
            <QuotaCard key={m.modelId} model={m} stale={quota.isStale} />
          ))}
          {showJson && (
            <pre data-testid="quota-json">{JSON.stringify(snapshot, null, 2)}</pre>
          )}
        </section>
      )}

      <section data-testid="all-accounts">
        <h2>All accounts</h2>
        {allAccounts.data && <AccountsTable results={allAccounts.data} />}
        {allAccounts.isError && (
          <p data-testid="all-accounts-error">Failed to load all accounts</p>
        )}
      </section>
    </main>
  )
}
