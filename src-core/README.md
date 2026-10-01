# src-core — vendored pure logic from the upstream CLI

- **Vendor tag:** `core-0.2.9`
- **Source:** https://github.com/skainguyen1412/antigravity-usage (`v0.2.9`)
- **Sync date:** 2026-09-30

## Files vendored in Task 1

| File | Upstream source |
|------|-----------------|
| `quota/types.ts` | `src/quota/types.ts` (verbatim) |
| `quota/service.ts` | `src/quota/service.ts` (import paths only: `.js` suffixes stripped for bundler resolution) |
| `core/errors.ts` | `src/core/errors.ts` (verbatim) |
| `core/logger.ts` | `src/core/logger.ts` (verbatim) |
| `core/env.ts` | `src/core/env.ts` (verbatim) |
| `core/mask.ts` | `src/core/mask.ts` (verbatim) |

## Adaptation rules

- `fetchQuota(method: QuotaMethod)` signature is unchanged.
- Upstream `service.ts` has no `commander`/`cli-table3`/`inquirer` imports, so
  nothing CLI-only had to be stripped in Task 1.
- Upstream `src/version.ts` (reads `package.json` at runtime) was intentionally
  **not** vendored: the GUI version lives in the root `package.json` and
  `src-tauri/tauri.conf.json`.
- `service.ts` imports `../google/*` and `../local/*`; those modules land in
  Task 2. Until then `tsc --noEmit` reports TS2307 for those imports — expected.
- Shared config paths are unchanged (same as CLI, login state is shared):
  - macOS: `~/Library/Application Support/antigravity-usage/`
  - Linux: `~/.config/antigravity-usage/`
  - Windows: `%APPDATA%/antigravity-usage/`

- State files are written atomically (GUI-local, not upstream):
  `core/atomic-write.ts` replaces `writeFileSync` in `accounts/storage.ts`,
  `accounts/config.ts`, `google/storage.ts` and `wakeup/storage.ts`. The GUI,
  the CLI and the scheduled trigger share these files concurrently, and a
  truncate-then-write could be read half-written. Re-apply after a sync.

## Syncing upstream

Re-copy the files above from the tagged upstream release, re-apply the import
path fix, bump the vendor tag here, and run the full test suite.
