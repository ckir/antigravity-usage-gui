import { useEffect, useState } from 'react'
import { startLogin, cancelLogin, completeManualLogin } from '../../src-tauri/commands/accounts'

export interface LoginDialogProps {
  /** true: show manual copy-paste flow; false: auto system-browser flow. */
  manual: boolean
  onClose: () => void
  onSuccess?: (email?: string) => void
}

/**
 * Login dialog. Auto mode kicks off `login_start` (system browser opened by
 * the Rust shell) and shows a waiting state with Cancel. Manual mode shows the
 * OAuth URL returned by `login_start({manual: true})` — built backend-side
 * with src-core's `buildManualAuthUrl` — plus a paste input whose content is
 * completed via src-core's `completeManualLogin` (same function, IPC transport).
 */
export default function LoginDialog({ manual, onClose, onSuccess }: LoginDialogProps) {
  const [authUrl, setAuthUrl] = useState<string>('')
  const [pastedUrl, setPastedUrl] = useState('')
  const [pending, setPending] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setPending(true)
    setError(null)
    startLogin(manual)
      .then((url) => {
        if (!cancelled && manual) setAuthUrl(url)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to start login')
      })
      .finally(() => {
        if (!cancelled) setPending(false)
      })
    return () => {
      cancelled = true
    }
  }, [manual])

  const handleCancel = (): void => {
    if (!manual) {
      void cancelLogin().catch(() => undefined)
    }
    onClose()
  }

  const handleManualSubmit = (): void => {
    if (!pastedUrl.trim()) return
    setPending(true)
    setError(null)
    completeManualLogin(pastedUrl.trim())
      .then((email) => {
        onSuccess?.(email)
        onClose()
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Manual login failed')
      })
      .finally(() => {
        setPending(false)
      })
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={manual ? 'Manual login' : 'Login'} data-testid="login-dialog">
      <h2>{manual ? 'Manual login' : 'Waiting for browser…'}</h2>

      {error && <p data-testid="login-error">{error}</p>}

      {!manual && (
        <p data-testid="login-waiting">
          {pending ? 'Opening your browser to sign in with Google…' : 'Complete sign-in in your browser.'}
        </p>
      )}

      {manual && (
        <div>
          <p>Open this URL in your browser, sign in, then paste the localhost redirect URL below.</p>
          {authUrl && (
            <p data-testid="manual-auth-url">
              <a href={authUrl}>{authUrl}</a>
            </p>
          )}
          <label>
            Pasted callback URL
            <input
              type="text"
              data-testid="manual-url-input"
              value={pastedUrl}
              placeholder="http://127.0.0.1:PORT/callback?code=…"
              onChange={(e) => setPastedUrl(e.target.value)}
            />
          </label>
          <button
            type="button"
            data-testid="manual-submit"
            disabled={pending || !pastedUrl.trim()}
            onClick={handleManualSubmit}
          >
            Complete login
          </button>
        </div>
      )}

      <button type="button" data-testid="login-cancel" onClick={handleCancel}>
        Cancel
      </button>
    </div>
  )
}
