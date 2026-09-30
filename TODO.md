# TODO

Outstanding items carried from implementation reviews. Checked items are done.

## Pre-release (must fix before publishing binaries)

- [ ] Updater re-key: replace `REPLACE_OWNER` endpoint + dummy pubkey in `src-tauri/tauri.conf.json:43-47`, add signing private key as CI secret
- [ ] Node runtime decision: system Node ≥ 18 requirement vs pinned sidecar (`src-tauri/src/main.rs` documents the current assumption)
- [ ] Full `tauri build` verification on Windows/macOS/Linux (CI matrix exists in `.github/workflows/ci.yml`; only `cargo check` run locally)

## Backlog (nice to have)

- [ ] Clipboard fallback in `src/views/Diagnostics.tsx` (`copyReport` has no non-Clipboard-API path)
- [ ] `src-core` sync process: upstream releases → vendor → record tag in `src-core/README.md` (currently `core-0.2.9`)
- [ ] Quota history persistence for future charts (see ROADMAP v0.2)

## Done

- [x] Scaffold Tauri + React app, vendor `src-core` quota/core modules
- [x] Quota IPC bridge + Dashboard (incl. fraction→percent boundary fix)
- [x] Accounts, login/logout, status, doctor views
- [x] Wakeup UI + cron + new Windows Task Scheduler + retry-with-backoff
- [x] Tray, autostart, auto-refresh, bundles config, 3-OS CI
