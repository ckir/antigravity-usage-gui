import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listAccounts,
  getActiveAccount,
  switchAccount,
  removeAccount,
  refreshAccount,
} from '../../src-tauri/commands/accounts'
import LoginDialog from '../components/LoginDialog'

/** 5-minute stale time matching the CLI quota cache (Global Constraints). */
export const ACCOUNTS_STALE_MS = 5 * 60 * 1000
export const accountsKey = ['accounts'] as const
export const activeAccountKey = ['active-account'] as const

export default function Accounts() {
  const [loginOpen, setLoginOpen] = useState(false)
  const [manualLogin, setManualLogin] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const queryClient = useQueryClient()
  const accounts = useQuery({ queryKey: accountsKey, queryFn: listAccounts, staleTime: ACCOUNTS_STALE_MS })
  const active = useQuery({ queryKey: activeAccountKey, queryFn: getActiveAccount, staleTime: ACCOUNTS_STALE_MS })

  const invalidate = (): void => {
    setConfirmRemove(null)
    void queryClient.invalidateQueries({ queryKey: accountsKey })
    void queryClient.invalidateQueries({ queryKey: activeAccountKey })
  }
  const onError = (e: unknown): void => {
    setActionError(e instanceof Error ? e.message : 'Account action failed')
  }

  const switchMutation = useMutation({ mutationFn: switchAccount, onSettled: invalidate, onError })
  const removeMutation = useMutation({ mutationFn: removeAccount, onSettled: invalidate, onError })
  const refreshMutation = useMutation({
    mutationFn: (email?: string) => refreshAccount(email),
    onSettled: invalidate,
    onError,
  })

  const openLogin = (manual: boolean): void => {
    setManualLogin(manual)
    setLoginOpen(true)
  }

  return (
    <main data-testid="accounts-view">
      <header>
        <h1>Accounts</h1>
        <button type="button" data-testid="add-account" onClick={() => openLogin(false)}>
          Add
        </button>
        <button type="button" data-testid="add-account-manual" onClick={() => openLogin(true)}>
          Add (manual)
        </button>
      </header>

      {accounts.isLoading && <p data-testid="accounts-loading">Loading accounts…</p>}
      {accounts.isError && <p data-testid="accounts-error">Failed to load accounts</p>}
      {actionError && <p data-testid="accounts-action-error">{actionError}</p>}

      {accounts.data && (
        <table data-testid="accounts-manage-table">
          <thead>
            <tr>
              <th>Account</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {accounts.data.map((email) => {
              const isActive = active.data === email
              return (
                <tr key={email} data-testid={`account-row-${email}`}>
                  <td>
                    {email}
                    {isActive && <span data-testid="active-marker">active</span>}
                  </td>
                  <td>
                    <button
                      type="button"
                      data-testid={`switch-${email}`}
                      disabled={isActive || switchMutation.isPending}
                      onClick={() => switchMutation.mutate(email)}
                    >
                      Switch
                    </button>
                    <button
                      type="button"
                      data-testid={`refresh-${email}`}
                      disabled={refreshMutation.isPending}
                      onClick={() => refreshMutation.mutate(email)}
                    >
                      Refresh
                    </button>
                    {confirmRemove === email ? (
                      <>
                        <span>Remove {email}?</span>
                        <button
                          type="button"
                          data-testid={`confirm-remove-${email}`}
                          disabled={removeMutation.isPending}
                          onClick={() => removeMutation.mutate(email)}
                        >
                          Confirm
                        </button>
                        <button type="button" data-testid={`cancel-remove-${email}`} onClick={() => setConfirmRemove(null)}>
                          Keep
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        data-testid={`remove-${email}`}
                        onClick={() => setConfirmRemove(email)}
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {loginOpen && (
        <LoginDialog manual={manualLogin} onClose={() => setLoginOpen(false)} onSuccess={() => invalidate()} />
      )}
    </main>
  )
}
