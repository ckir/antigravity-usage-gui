# antigravity-usage GUI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Tauri v2 + React desktop app with full CLI parity plus Windows wakeup.

**Architecture:** Vendor CLI `src/quota, google, local, accounts, core, wakeup` into `src-core/` as a pure TS library; thin Tauri Rust shell for window/tray/autostart; React sidebar UI calling TS via Tauri IPC commands.

**Tech Stack:** Tauri v2, React 18 + Vite + TypeScript 5.7+, Tailwind, TanStack Query, Vitest, Node >=18.

**Spec:** `docs/superpowers/specs/2026-09-30-antigravity-usage-gui-design.md`

## Global Constraints

- Node >=18 (verbatim from CLI engines).
- Shared config dir with CLI — do not change paths: macOS `~/Library/Application Support/antigravity-usage/`, Linux `~/.config/antigravity-usage/`, Windows `%APPDATA%/antigravity-usage/`.
- Quota cache TTL 5 minutes; `--refresh` forces fetch.
- Multi-account fetch must be sequential, never parallel (token-switch race).
- `--account` forces `google` method (local always returns IDE account).
- Wakeup cooldown default 1 hour; retry with exponential backoff.
- All three OS must build: Windows nsis+msi, macOS dmg, Linux AppImage/deb.
- `.superpowers/` is gitignored and never committed.

---

### Task 1: Scaffold app + vendor src-core library

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `src-tauri/tauri.conf.json`, `src-tauri/src/main.rs`, `src/main.tsx`, `src/App.tsx`
- Create: `src-core/README.md` (vendor tag `core-0.2.9`, source URL, sync date)
- Create: `src-core/quota/types.ts`, `src-core/quota/service.ts`, `src-core/core/errors.ts`, `src-core/core/logger.ts`, `src-core/core/env.ts`, `src-core/core/mask.ts` (copied from upstream, CLI-only imports removed)
- Test: `src-core/quota/types.test.ts`

**Interfaces:**
- Consumes: upstream `https://github.com/skainguyen1412/antigravity-usage` tag `v0.2.9` file list (quota/types, quota/service, core/*).
- Produces: `QuotaSnapshot`, `ModelQuotaInfo`, `PromptCreditsInfo` types for Tasks 2-5; `npm run dev/test/build` scripts.

- [ ] **Step 1: Write the failing test**

```typescript
// src-core/quota/types.test.ts
import { describe, it, expect } from 'vitest'
import type { QuotaSnapshot } from './types'

describe('vendored quota types', () => {
  it('accepts a minimal snapshot', () => {
    const s: QuotaSnapshot = {
      timestamp: new Date().toISOString(),
      method: 'local',
      models: [{ label: 'Claude Sonnet', modelId: 'claude-sonnet-4-5', isExhausted: false, remainingPercentage: 78 }]
    }
    expect(s.models[0].modelId).toBe('claude-sonnet-4-5')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src-core/quota/types.test.ts`
Expected: FAIL with "Cannot find module './types'"

- [ ] **Step 3: Scaffold configs + vendor minimal files**

```json
// package.json (excerpt — full file required)
{
  "name": "antigravity-usage-gui",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=18" },
  "scripts": {
    "dev": "tauri dev",
    "build": "tsc --noEmit && vite build && tauri build",
    "test": "vitest run",
    "frontend:dev": "vite"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0",
    "typescript": "^5.7.3",
    "vite": "^6.0.0",
    "vitest": "^4.0.18"
  }
}
```

Copy verbatim from upstream `src/quota/types.ts` into `src-core/quota/types.ts` (no edits except import paths). Copy `src/core/errors.ts`, `src/core/logger.ts`, `src/core/env.ts`, `src/core/mask.ts`. Copy `src/quota/service.ts` but delete `commander`/`cli-table3` imports — keep `fetchQuota(method: QuotaMethod)` signature unchanged.

```rust
// src-tauri/src/main.rs (minimal shell for this task)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
fn main() { tauri::Builder::default().run(tauri::generate_context!()).expect("tauri failed"); }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src-core/quota/types.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json vite.config.ts vitest.config.ts src-tauri/ src/main.tsx src/App.tsx src-core/ 
git commit -m "feat: scaffold tauri-react app and vendor src-core quota types"
```

---

### Task 2: Quota IPC bridge + Dashboard view

**Files:**
- Create: `src-core/accounts/cache.ts`, `src-core/accounts/config.ts`, `src-core/accounts/manager.ts`, `src-core/accounts/storage.ts`, `src-core/accounts/types.ts`, `src-core/accounts/index.ts` (verbatim copy, fix relative imports to `../google/*`, `../core/*`)
- Create: `src-core/google/cloudcode.ts`, `src-core/google/oauth.ts`, `src-core/google/parser.ts`, `src-core/google/storage.ts`, `src-core/google/token-manager.ts`
- Create: `src-core/local/connect-client.ts`, `src-core/local/index.ts`, `src-core/local/local-parser.ts`, `src-core/local/port-detective.ts`, `src-core/local/port-prober.ts`, `src-core/local/process-detector.ts`
- Create: `src-tauri/commands/quota.ts`
- Create: `src/hooks/useQuota.ts`, `src/views/Dashboard.tsx`, `src/components/QuotaCard.tsx`, `src/components/AccountsTable.tsx`
- Test: `src-core/quota/service.test.ts` (ported), `src/hooks/useQuota.test.tsx`

**Interfaces:**
- Consumes: `fetchQuota(method: 'auto'|'local'|'google') => Promise<QuotaSnapshot>` from Task 1; `getAccountManager()`, `saveCache/loadCache/isCacheValid` from accounts.
- Produces: `invoke('get_quota', {method, account, refresh}) => QuotaSnapshot`; `invoke('get_all_quotas', {refresh}) => AllAccountsQuotaResult[]`; `<Dashboard/>` for App shell.

- [ ] **Step 1: Write the failing test (cache-first rule)**

```typescript
// src-core/quota/service.test.ts (excerpt)
import { describe, it, expect } from 'vitest'
import { isCacheValid } from '../accounts/cache'
describe('quota cache rule', () => {
  it('treats fresh cache as valid within 5 minutes', () => {
    expect(isCacheValid('x@y.com', Date.now() - 4 * 60 * 1000)).toBe(true)
  })
  it('treats stale cache as invalid after 5 minutes', () => {
    expect(isCacheValid('x@y.com', Date.now() - 6 * 60 * 1000)).toBe(false)
  })
})
```

Note: implement `isCacheValid(email, mtimeMs?)` to accept optional mtime for testability; production wrapper reads file mtime.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src-core/quota/service.test.ts`
Expected: FAIL with "Cannot find module '../accounts/cache'"

- [ ] **Step 3: Vendor remaining core + write IPC bridge**

Copy accounts/*, google/*, local/* verbatim from upstream; only change: replace `process.exit` paths with thrown errors (GUI must not exit). Keep function names identical: `fetchQuota`, `fetchQuotaForAccount`, `getAccountManager`, `getTokenManager`, `resetTokenManager`.

```typescript
// src-tauri/commands/quota.ts
import { invoke } from '@tauri-apps/api/core'
import type { QuotaSnapshot } from '../../src-core/quota/types'
export type QuotaMethod = 'auto' | 'local' | 'google'
export interface AllAccountsQuotaResult {
  email: string; isActive: boolean
  status: 'success' | 'cached' | 'error'
  snapshot?: QuotaSnapshot; error?: string; cacheAge?: number
}
export async function getQuota(args: { method?: QuotaMethod; account?: string; refresh?: boolean; allModels?: boolean }): Promise<QuotaSnapshot> {
  return invoke('get_quota', args)
}
export async function getAllQuotas(refresh = false): Promise<AllAccountsQuotaResult[]> {
  return invoke('get_all_quotas', { refresh })
}
```

```tsx
// src/hooks/useQuota.ts
import { useQuery } from '@tanstack/react-query'
import { getQuota, type QuotaMethod } from '../src-tauri/commands/quota'
export function useQuota(method: QuotaMethod = 'auto', refresh = false) {
  return useQuery({ queryKey: ['quota', method, refresh], queryFn: () => getQuota({ method, refresh }), staleTime: 5 * 60 * 1000 })
}
```

Dashboard renders `QuotaCard` per `snapshot.models` (hide `isAutocompleteOnly` unless `allModels`), progress bar color: >=50 green, >=20 amber, else red; reset countdown from `timeUntilResetMs`; stale badge when `status==='cached'`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src-core/quota/service.test.ts src/hooks/useQuota.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-core/accounts src-core/google src-core/local src-tauri/commands/quota.ts src/hooks/useQuota.ts src/views/Dashboard.tsx src/components/
git commit -m "feat: quota IPC bridge and dashboard with cache-first refresh"
```

---

### Task 3: Accounts, login/logout, status, doctor views

**Files:**
- Create: `src-tauri/commands/accounts.ts`, `src-tauri/commands/doctor.ts`
- Create: `src/views/Accounts.tsx`, `src/views/Diagnostics.tsx`, `src/components/LoginDialog.tsx`
- Modify: `src/App.tsx:1-60` (add sidebar nav Dashboard/Accounts/Wakeup/Doctor)
- Test: `src-tauri/commands/accounts.test.ts`

**Interfaces:**
- Consumes: `getQuota/getAllQuotas` from Task 2; `getAccountManager(): {getAccountEmails(): string[], getActiveEmail(): string|null, setActiveAccount(email): void}`.
- Produces: `invoke('accounts_list'|'accounts_add'|'accounts_switch'|'accounts_remove'|'accounts_refresh')`; `invoke('doctor') => DoctorReport {env, auth[], localServer}`; `<Accounts/>`, `<Diagnostics/>`, `<LoginDialog manual: boolean>`.

- [ ] **Step 1: Write the failing test**

```typescript
// src-tauri/commands/accounts.test.ts
import { describe, it, expect, vi } from 'vitest'
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async (cmd: string) => cmd === 'accounts_list' ? ['a@x.com'] : null) }))
import { listAccounts } from './accounts'
describe('accounts IPC', () => {
  it('lists accounts', async () => { expect(await listAccounts()).toEqual(['a@x.com']) })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src-tauri/commands/accounts.test.ts`
Expected: FAIL with "Cannot find module './accounts'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// src-tauri/commands/accounts.ts
import { invoke } from '@tauri-apps/api/core'
export const listAccounts = (): Promise<string[]> => invoke('accounts_list')
export const switchAccount = (email: string): Promise<void> => invoke('accounts_switch', { email })
export const removeAccount = (email: string): Promise<void> => invoke('accounts_remove', { email })
export const refreshAccount = (email?: string): Promise<void> => invoke('accounts_refresh', { email })
export const startLogin = (manual = false): Promise<string> => invoke('login_start', { manual })
// returns OAuth URL (auto mode opens system browser via Rust `open`; manual mode returns URL for copy-paste dialog)
```

```typescript
// src-tauri/commands/doctor.ts
import { invoke } from '@tauri-apps/api/core'
export interface DoctorReport { env: Record<string, string>; auth: { email: string; valid: boolean }[]; localServer: { running: boolean; port?: number }; tips: string[] }
export const runDoctor = (): Promise<DoctorReport> => invoke('doctor')
```

`LoginDialog`: auto mode shows "waiting for browser…" + Cancel; manual mode shows URL + input for pasted callback URL. `Accounts` view: table with active marker, Switch/Remove/Refresh per row, Add button. `Diagnostics`: status chips + doctor tips + Copy Report button.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src-tauri/commands/accounts.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/commands/accounts.ts src-tauri/commands/doctor.ts src/views/Accounts.tsx src/views/Diagnostics.tsx src/components/LoginDialog.tsx src/App.tsx
git commit -m "feat: accounts login/logout and doctor diagnostics views"
```

---

### Task 4: Wakeup UI + schedulers including new Windows support

**Files:**
- Create: `src-core/wakeup/types.ts`, `src-core/wakeup/storage.ts`, `src-core/wakeup/trigger-service.ts`, `src-core/wakeup/reset-detector.ts`, `src-core/wakeup/schedule-converter.ts`, `src-core/wakeup/cron-installer.ts`, `src-core/wakeup/account-resolver.ts`, `src-core/wakeup/index.ts` (verbatim copy)
- Create: `src-core/wakeup/windows.ts` (NEW — no upstream equivalent)
- Create: `src-tauri/commands/wakeup.ts`, `src/views/Wakeup.tsx`
- Test: `src-core/wakeup/windows.test.ts`, `src-core/wakeup/reset-detector.test.ts` (ported)

**Interfaces:**
- Consumes: `QuotaSnapshot` from Task 1; account emails from Task 3.
- Produces: `WakeupConfig { mode: 'interval'|'daily'|'cron', intervalHours?: number, dailyTimes?: string[], cronExpr?: string, models: string[], emails: string[]|'all', cooldownMinutes: number }`; `installWakeup(cfg)`, `uninstallWakeup()`, `testTrigger({email, model, prompt})`, `getWakeupStatus()`, `getWakeupHistory(limit)`; `<Wakeup/>`.

- [ ] **Step 1: Write the failing test (Windows XML generation)**

```typescript
// src-core/wakeup/windows.test.ts
import { describe, it, expect } from 'vitest'
import { buildTaskXml } from './windows'
describe('windows scheduler xml', () => {
  it('builds schtasks XML with daily trigger', () => {
    const xml = buildTaskXml({ taskName: 'AntigravityWakeup', nodePath: 'C:\\node.exe', script: 'C:\\app\\wakeup.js', dailyTimes: ['09:00'] })
    expect(xml).toContain('AntigravityWakeup')
    expect(xml).toContain('09:00')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src-core/wakeup/windows.test.ts`
Expected: FAIL with "Cannot find module './windows'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// src-core/wakeup/windows.ts
export interface WindowsTaskOpts { taskName: string; nodePath: string; script: string; dailyTimes?: string[]; intervalHours?: number }
export function buildTaskXml(o: WindowsTaskOpts): string {
  const time = o.dailyTimes?.[0] ?? '09:00'
  return `<?xml version="1.0"?><Task><RegistrationInfo><Description>Antigravity wakeup ${o.taskName}</Description></RegistrationInfo><Triggers><CalendarTrigger><StartBoundary>2026-01-01T${time}:00</StartBoundary></CalendarTrigger></Triggers><Actions><Exec><Command>${o.nodePath}</Command><Arguments>"${o.script}" trigger --scheduled</Arguments></Exec></Actions></Task>`
}
export async function installWindowsTask(o: WindowsTaskOpts): Promise<void> {
  const { execFile } = await import('node:child_process')
  const fs = await import('node:fs')
  const tmp = `${process.env.TEMP}\\${o.taskName}.xml`
  fs.writeFileSync(tmp, buildTaskXml(o))
  await new Promise<void>((res, rej) => execFile('schtasks', ['/Create', '/TN', o.taskName, '/XML', tmp, '/F'], (e) => e ? rej(e) : res()))
}
export async function uninstallWindowsTask(taskName: string): Promise<void> {
  const { execFile } = await import('node:child_process')
  await new Promise<void>((res, rej) => execFile('schtasks', ['/Delete', '/TN', taskName, '/F'], (e) => e ? rej(e) : res()))
}
```

Port `cron-installer.ts`, `reset-detector.ts` (smart reset: remaining 100% + reset ~5h away → trigger all), `trigger-service.ts` (sequential per-account, cooldown check, backoff) verbatim. Wakeup view: mode radio, model checkboxes default `['claude-sonnet-4-5','gemini-3-flash','gemini-3-pro-low']`, account scope, Install/Uninstall, Status card (enabled/next run/last result), History table, Test form (email/model/prompt default "hi").

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src-core/wakeup/windows.test.ts src-core/wakeup/reset-detector.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-core/wakeup/ src-tauri/commands/wakeup.ts src/views/Wakeup.tsx
git commit -m "feat: wakeup UI with cron and new windows task scheduler"
```

---

### Task 5: Tray, autostart, auto-refresh, bundles + CI

**Files:**
- Modify: `src-tauri/src/main.rs` (tray + autostart + scheduler invoke handlers)
- Modify: `src-tauri/tauri.conf.json` (bundle targets, updater, icons)
- Create: `src/components/TrayMenu.ts`, `src/hooks/useAutoRefresh.ts`
- Create: `.github/workflows/ci.yml`
- Test: `src/hooks/useAutoRefresh.test.ts`

**Interfaces:**
- Consumes: all IPC from Tasks 2-4.
- Produces: tray tooltip with lowest quota %, autostart on login, 60s poll with 5-min stale, signed installers + updater.

- [ ] **Step 1: Write the failing test**

```typescript
// src/hooks/useAutoRefresh.test.ts
import { describe, it, expect } from 'vitest'
import { refreshIntervalMs } from './useAutoRefresh'
describe('auto refresh', () => {
  it('polls every 60s', () => { expect(refreshIntervalMs).toBe(60_000) })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/hooks/useAutoRefresh.test.ts`
Expected: FAIL with "Cannot find module './useAutoRefresh'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/hooks/useAutoRefresh.ts
export const refreshIntervalMs = 60_000
export const quotaStaleMs = 5 * 60 * 1000
```

```rust
// src-tauri/src/main.rs (excerpt — tray + commands registration)
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
fn main() {
  tauri::Builder::default()
    .setup(|app| {
      let _ = TrayIconBuilder::new().tooltip("antigravity-usage").on_tray_icon_event(|_, e| {
        if let TrayIconEvent::Click { .. } = e { /* show window */ }
      }).build(app);
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      // full list must match Tasks 2-4: get_quota, get_all_quotas, accounts_list,
      // accounts_switch, accounts_remove, accounts_refresh, login_start, doctor,
      // wakeup_config, wakeup_install, wakeup_uninstall, wakeup_test,
      // wakeup_history, wakeup_status
      get_quota, get_all_quotas, accounts_list, login_start, doctor, wakeup_status
    ])
    .run(tauri::generate_context!()).expect("tauri failed");
}
```

```yaml
# .github/workflows/ci.yml (excerpt)
name: ci
on: [push, pull_request]
jobs:
  test:
    strategy: { matrix: { os: [windows-latest, macos-latest, ubuntu-latest] } }
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm test
      - run: npm run build
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all suites)

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/main.rs src-tauri/tauri.conf.json src/components/TrayMenu.ts src/hooks/useAutoRefresh.ts .github/workflows/ci.yml
git commit -m "feat: tray autostart refresh bundles and CI matrix"
```
