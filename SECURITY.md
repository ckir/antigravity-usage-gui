# Security Policy

## What's sensitive here

- **OAuth tokens** live only on your machine in the standard config dir (`%APPDATA%/antigravity-usage/` on Windows, `~/.config/antigravity-usage/` on Linux, `~/Library/Application Support/antigravity-usage/` on macOS). They are never sent anywhere except Google's OAuth/token endpoints and the Cloud Code API. This app has no backend and no telemetry.
- **The OAuth client ID/secret in `src-core/google/oauth.ts`** is the upstream CLI's public desktop-app credential, vendored verbatim. It ships in every install by design (same as the CLI) and is required for login to work out of the box. GitHub secret scanning flags it on push — bypasses are recorded with reason `false_positive`. Do not "fix" this by deleting the defaults unless login is reworked to match (see GUIDANCE below).
- **The updater `pubkey` in `src-tauri/tauri.conf.json`** is currently a dummy placeholder. It must be replaced with a real generated key before any release; the private key lives only as a CI secret, never in the repo.

## Reporting a vulnerability

Open a **private** report via GitHub Security Advisories on this repo (`Security` tab → `Report a vulnerability`). Include steps to reproduce and the affected version/commit. Do not open a public issue for vulnerabilities.

We aim to acknowledge within 7 days. If you need a shipping embargo, say so in the report.

## Guidance for contributors

- Never commit personal access tokens, refresh tokens, or `*.pem`/signing private keys. The signing private key is CI-secret-only.
- If push protection blocks you on the vendored OAuth credential, do not strip it — ask a maintainer to record a bypass instead, so login keeps working.
