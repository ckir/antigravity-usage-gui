import type { AllAccountsQuotaResult } from '../../src-tauri/commands/quota'

export interface AccountsTableProps {
  results: AllAccountsQuotaResult[]
}

function statusBadge(status: AllAccountsQuotaResult['status']): string {
  switch (status) {
    case 'success':
      return 'fresh'
    case 'cached':
      return 'cached'
    case 'error':
      return 'error'
  }
}

export default function AccountsTable({ results }: AccountsTableProps) {
  return (
    <table data-testid="accounts-table">
      <thead>
        <tr>
          <th>Account</th>
          <th>Status</th>
          <th>Detail</th>
        </tr>
      </thead>
      <tbody>
        {results.map((r) => (
          <tr
            key={r.email}
            data-testid={`account-row-${r.email}`}
            data-active={r.isActive ? 'true' : 'false'}
          >
            <td>
              {r.email}
              {r.isActive && <span data-testid="active-marker">active</span>}
            </td>
            <td data-testid="row-status">{statusBadge(r.status)}</td>
            <td>
              {r.status === 'error' ? (
                <span data-testid="row-error">{r.error ?? 'Unknown error'}</span>
              ) : (
                <span data-testid="row-age">
                  {r.status === 'cached' && r.cacheAge !== undefined
                    ? `cached ${r.cacheAge}s ago`
                    : 'fresh'}
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
