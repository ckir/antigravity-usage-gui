import { describe, it, expect, vi } from 'vitest'
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async (cmd: string) => cmd === 'accounts_list' ? ['a@x.com'] : null) }))
import { listAccounts } from './accounts'
describe('accounts IPC', () => {
  it('lists accounts', async () => { expect(await listAccounts()).toEqual(['a@x.com']) })
})
