# Contributing

## Setup

Prerequisites: **Node.js ≥ 18** and a **Rust toolchain** (stable).

```bash
git clone https://github.com/ckir/antigravity-usage-gui
cd antigravity-usage-gui
npm install
npm test        # full Vitest suite, must be green before any PR
npm run dev     # Tauri dev window
```

## Workflow

- Work on a branch off `main`; keep PRs focused and small.
- **TDD**: add or update a Vitest test first, watch it fail, implement, watch it pass. Tests live next to sources (`*.test.ts(x)`).
- Before pushing, run the full gate: `npm test`, `npx tsc --noEmit`, `npx vite build`.
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`).

## Repo map

- `src/` — React frontend (views, hooks, components). Never import `node:*` or backend files here; talk to the backend via Tauri `invoke` only.
- `src-tauri/commands/` — frontend IPC wrappers (thin, `invoke` only).
- `src-tauri/backend/` — Node sidecar: the only place that may import `src-core` modules needing `node:http`, `node:fs`, `child_process`.
- `src-core/` — vendored upstream CLI logic. **Do not hand-edit semantics**: sync from upstream releases and record the tag in `src-core/README.md`. Non-vendored additions (e.g. `wakeup/retry.ts`, `wakeup/windows.ts`) live alongside with tests.
- `src-tauri/src/main.rs` — Rust shell (tray, autostart, updater). Register every new IPC handler in the `invoke_handler` list.
- `docs/superpowers/specs/` + `docs/superpowers/plans/` — design specs and implementation plans for larger work.

## Upstream syncs

When the upstream CLI (`skainguyen1412/antigravity-usage`) releases:

1. Copy changed files verbatim into `src-core/`, fixing only import paths and `process.exit` → thrown errors.
2. Update the vendor tag in `src-core/README.md`.
3. Run the full gate; port or add tests for changed behavior.

## Code of conduct

Be kind and professional — see [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
