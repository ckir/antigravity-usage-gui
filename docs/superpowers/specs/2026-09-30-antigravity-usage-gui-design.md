# antigravity-usage GUI Frontend — Design Spec

Date: 2026-09-30
Status: Draft for user review
Upstream CLI: https://github.com/skainguyen1412/antigravity-usage (v0.2.9)
Repo: E:\antigravity-usage-gui (empty, no commits yet)
Decisions: Full CLI parity / Tauri + React / Reuse TS as library (Approach A) / All 3 OS equal / Include Windows wakeup

## 1. Goal

Build a Tauri v2 + React desktop GUI for `antigravity-usage` with full CLI parity:
quota dashboard, multi-account management, Google login/logout, status, doctor
diagnostics, and wakeup scheduling — plus new Windows wakeup support the CLI lacks.

Success criteria v1:
- Cold start shows quota <3s from cache, manual refresh <8s.
- Login adds 2nd account; all-accounts view matches CLI `--json` output.
- Wakeup install + test-trigger passes on Windows, macOS, Linux.
- Works offline via Local mode when IDE is open.

## 2. Architecture / Repo Layout (Approved)

- `src-core/` — vendored pure logic from CLI `src/quota, google, local, accounts,
  core, wakeup` (strip `commander`, `cli-table3`, `inquirer`). Version-tagged
  (e.g. `core-0.2.9`) for upstream sync. Same config paths as CLI so login state
  is shared:
  - macOS: `~/Library/Application Support/antigravity-usage/`
  - Linux: `~/.config/antigravity-usage/`
  - Windows: `%APPDATA%/antigravity-usage/`
- `src-tauri/` — thin Rust shell only: window, tray icon + tooltip, autostart,
  scheduler install hooks. No quota/auth logic in Rust.
- `src/` (React + Vite + Tailwind + React Query):
  views Dashboard / Accounts / Wakeup / Diagnostics, plus tray menu.
- IPC bridge `commands.ts`: `get_quota`, `get_all_quotas`, `login_start/cancel`,
  `accounts_list/add/switch/remove/refresh`, `doctor`, `status`,
  `wakeup_config/install/uninstall/test/history/status`.
- New code: `src-core/wakeup/windows.ts` — Task Scheduler via `schtasks /XML`
  (create/delete/query). macOS/Linux reuse CLI crontab logic.
- React Query: 5-min stale time matching CLI cache; 60s auto-refresh poll.

Non-goals v1: no cloud sync of tokens, no editor extension, no mobile build.

## 3. Components / Screens (Approved: Sidebar Layout A)

Shell: left sidebar nav (Dashboard / Accounts / Wakeup / Doctor), header with
method selector (Auto/Local/Google), account switcher, Refresh + age badge.

- Dashboard: per-model cards (`claude-sonnet-4-5`, `gemini-3-flash`,
  `gemini-3-pro-low` + others) with % left bar, reset countdown, exhausted flag;
  prompt-credits panel; all-accounts comparison table (active highlight, cached
  vs fresh badge, per-row error). Toggle `--all-models` to include autocomplete
  models. JSON view toggle for parity debugging.
- Accounts: list, add (OAuth), switch, remove with confirm, refresh tokens,
  current-active marker. Mirrors `accounts list/add/switch/remove/current/refresh`.
- Wakeup: schedule form (interval/daily/custom cron), model multi-select,
  account scope, cooldown setting; Install/Uninstall to native scheduler;
  Status (enabled, next run, last result, cron/schtasks state); History table;
  Test-trigger form (email, model, prompt default "hi").
- Diagnostics: `status` per account (valid/expired), `doctor` checks (env vars,
  auth, local server connectivity) with copyable report.

Rejected: Top-tabs tray-first (B) — too cramped for history tables; Single
scroll page (C) — cluttered with 3+ accounts.

## 4. Data Flow (Approved)

React Query → Tauri IPC → `src-core.fetchQuota(method)`:
1. `auto` tries Local first: detect Antigravity process → discover ports →
   probe Connect API → `parseLocalQuotaSnapshot`.
2. On local failure, fallback to Google if logged in: `CloudCodeClient.
   loadCodeAssist + fetchAvailableModels` → `parseQuotaSnapshot`.
3. `--account` forces `google` method (local always returns IDE account).
4. Multi-account fetch is strictly sequential (no parallel token-switch races),
   with per-account cache save; cache valid 5 min; on error fall back to cached
   snapshot with age shown.

Types reused verbatim: `QuotaSnapshot { timestamp, method, email, planType,
promptCredits, models[] }`, `ModelQuotaInfo { label, modelId,
remainingPercentage, isExhausted, resetTime, timeUntilResetMs,
isAutocompleteOnly }`.

## 5. Error Handling, Auth, Wakeup (Approved)

Auth: system-browser OAuth + localhost callback; `--manual` copy-paste fallback
for headless/SSH surfaced as "paste URL" dialog. Tokens local-only.

Error → UI mapping (no process exit, unlike CLI):
- `AntigravityNotRunning` → "Open IDE" banner + Retry-Local.
- `NoAuthMethodAvailable` → Login CTA.
- `LocalConnection/PortDetection` → restart-IDE hint + switch-to-Google.
- `NotLoggedIn/Authentication` → per-account re-login.
- `RateLimit` → countdown + auto-retry.
- `Network/API` → stale-cache banner with age.
- Multi-account row-level error states; never fail whole table if one cache exists.

Wakeup safety (from CLI): 1h cooldown default, exponential-backoff retry,
minimal-token trigger, detailed history. Scheduler: crontab mac/Linux;
`schtasks` XML on Windows (new). Smart reset detection (100% + ~5h reset window)
triggers all accounts; per-account targeting supported.

## 6. Testing, Build, Distribution (Approved)

- Vitest: port CLI `test/` for parser, cache validity, cooldown, scheduler XML
  generation, multi-account sequencing.
- UI tests: dashboard states (loading/cached/error/empty), accounts switch,
  wakeup install mock.
- `doctor` as CI smoke test.
- Tauri bundles: Windows nsis+msi, macOS dmg, Linux AppImage/deb; Tauri updater
  enabled. Version sync: app version + `core-<cli-version>` tag.
- `.superpowers/brainstorm/` persisted for mockups; must be gitignored (add on
  init). Installer does not touch shared config dir except via app logic.

## 7. Open Questions Resolved

- Scope: full parity (not minimal viewer).
- Stack: Tauri + React (not Electron/web-only/Python).
- Backend: reuse TS as vendored library (not subprocess/sidecar).
- OS: all three equal (not Windows-only).
- Windows wakeup: include in v1 via Task Scheduler (not deferred).

## 8. Implementation Notes (for future plan)

- Step 1: vendor `src-core`, strip CLI-only deps, add Vitest baseline.
- Step 2: Tauri shell + IPC + React sidebar + Dashboard (cached + refresh).
- Step 3: Accounts + login/logout + Diagnostics.
- Step 4: Wakeup UI + cron + new Windows schtasks module.
- Step 5: Tray, autostart, updater, bundles + CI matrix (win/mac/linux).
