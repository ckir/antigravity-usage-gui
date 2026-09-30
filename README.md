# antigravity-usage-gui

A desktop GUI for tracking your Antigravity model quota and usage. Full CLI parity with [`antigravity-usage`](https://github.com/skainguyen1412/antigravity-usage) — quota dashboard, multi-account management, Google login, diagnostics, and wakeup scheduling — plus Windows wakeup support the CLI lacks.

Built with **Tauri v2 + React 18 + TypeScript**.

## Features

- **Quota dashboard** — per-model cards (`claude-sonnet-4-5`, `gemini-3-flash`, `gemini-3-pro-low`, …) with % remaining, reset countdowns, exhausted flags, and prompt-credits panel
- **Multi-account** — list, add, switch, remove, and refresh Google accounts; side-by-side quota comparison
- **Dual-fetch** — Local IDE server first (fast, offline), Google Cloud Code API fallback; 5-minute cache with manual refresh
- **Login** — system-browser OAuth with manual copy-paste fallback for headless/SSH
- **Diagnostics** — auth status per account plus `doctor` checks (env, auth, local server) with copyable report
- **Wakeup scheduling** — interval/daily/cron + smart quota-reset detection, history, and test triggers; native schedulers on all three OS (**Windows Task Scheduler** support is new in this GUI)
- **Tray + autostart** — tray tooltip shows lowest quota %, auto-refresh every 60 s

## Quick start

Prerequisites: **Node.js ≥ 18** and a **Rust toolchain** (for the Tauri shell).

```bash
npm install
npm run dev      # Tauri dev window
npm test         # Vitest suite (65 tests)
npm run build    # Production bundles (nsis+msi / dmg / AppImage+deb)
```

## How it works

`src-core/` vendors the pure logic from the upstream CLI (`quota`, `google`, `local`, `accounts`, `core`, `wakeup`) as a TypeScript library — same token storage, same config paths, so CLI and GUI share login state:

- macOS: `~/Library/Application Support/antigravity-usage/`
- Linux: `~/.config/antigravity-usage/`
- Windows: `%APPDATA%/antigravity-usage/`

The React frontend talks to it through Tauri IPC commands; Node-only code (OAuth server, `schtasks`, crontab) stays backend-side so the browser bundle stays clean.

See [`docs/superpowers/specs/2026-09-30-antigravity-usage-gui-design.md`](docs/superpowers/specs/2026-09-30-antigravity-usage-gui-design.md) for the design and [`ROADMAP.md`](ROADMAP.md) for what's next.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Bug reports and PRs welcome — please read [`SECURITY.md`](SECURITY.md) before reporting vulnerabilities.

## License

MIT — see [`LICENSE`](LICENSE). Upstream CLI logic is MIT-licensed by its authors; see [`src-core/README.md`](src-core/README.md) for the vendor tag.
