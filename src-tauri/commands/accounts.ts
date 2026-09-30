import { invoke } from '@tauri-apps/api/core'

export const listAccounts = (): Promise<string[]> => invoke('accounts_list')
export const switchAccount = (email: string): Promise<void> => invoke('accounts_switch', { email })
export const removeAccount = (email: string): Promise<void> => invoke('accounts_remove', { email })
export const refreshAccount = (email?: string): Promise<void> => invoke('accounts_refresh', { email })
export const startLogin = (manual = false): Promise<string> => invoke('login_start', { manual })
// returns OAuth URL (auto mode opens system browser via Rust `open`; manual mode returns URL for copy-paste dialog)

/** Cancel a pending auto (browser) login. Pairs with `login_start` per the spec IPC list. */
export const cancelLogin = (): Promise<void> => invoke('login_cancel')

/** Currently active account email (mirrors CLI `accounts current`). */
export const getActiveAccount = (): Promise<string | null> => invoke('accounts_current')

/**
 * Complete a manual login with the pasted localhost callback URL.
 * Transport for the copy-paste fallback (headless/SSH): the backend completes
 * it with src-core's `completeManualLogin` (same validation + token exchange
 * as the CLI manual flow) — no new auth API here. The frontend must not import
 * `src-core/google/oauth` directly: it pulls `node:http`/`process.env`, which
 * breaks the browser bundle. Resolves to the logged-in email.
 */
export const completeManualLogin = (callbackUrl: string): Promise<string> =>
  invoke('accounts_add', { manualUrl: callbackUrl })
