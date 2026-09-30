# Roadmap

Current version: `0.1.0` (pre-release, no published binaries yet).

## v0.1 — first release

- [ ] Re-key the Tauri updater: real `endpoints` owner URL + generated keypair, private key as CI secret (placeholders in `src-tauri/tauri.conf.json` today)
- [ ] Decide the Node runtime story: require system Node ≥ 18 (current) or pin a sidecar binary for machines without Node
- [ ] Verify `tauri build` on all three OS via the CI matrix (only `cargo check` verified locally so far)
- [ ] Publish GitHub Release with nsis/msi, dmg, AppImage/deb + `latest.json` for auto-update
- [ ] Sync `src-core` to the latest upstream CLI tag and record it in `src-core/README.md`

## v0.2 — polish (ideas, not commitments)

- Quota history charts (persist snapshots locally, render trends)
- Richer tray menu (per-account quota, quick switch)
- `navigator.clipboard` fallback in Diagnostics copy (currently error-only path)
- Notifications when a model drops below a threshold
- Localization groundwork

## Non-goals

- Cloud sync of tokens (local-only by design)
- Editor extensions, mobile builds
- Windows wakeup is **in scope and implemented** (Task Scheduler) — it was the one CLI gap this GUI closes
