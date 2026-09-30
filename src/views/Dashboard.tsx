import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useQuota, QUOTA_STALE_MS } from '../hooks/useQuota'
import { getAllQuotas } from '../../src-tauri/commands/quota'
import QuotaCard from '../components/QuotaCard'
import AccountsTable from '../components/AccountsTable'

export default function Dashboard() {
  const [allModels, setAllModels] = useState(false)
  const [showJson, setShowJson] = useState(false)

  const quota = useQuota('auto')
  const allAccounts = useQuery({
    queryKey: ['all-quotas'],
    queryFn: () => getAllQuotas(false),
    staleTime: QUOTA_STALE_MS,
  })

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
          onClick={() => {
            void quota.refetch()
            void allAccounts.refetch()
          }}
        >
          Refresh
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
