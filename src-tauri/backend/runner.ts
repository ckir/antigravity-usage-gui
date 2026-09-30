/**
 * Node sidecar entry for the Tauri backend (Task 5).
 *
 * BACKEND-ONLY (`node` runtime, never the browser bundle). Bundled by
 * `npm run build:backend` into `dist-backend/runner.cjs`; the Rust handlers
 * in `src-tauri/src/main.rs` spawn one short-lived process per invoke:
 *
 *   node runner.cjs <method> '<json-args>'
 *
 * Stdout is exactly one JSON line:
 *   { "ok": true, "result": <value> } | { "ok": false, "error": <message> }
 *
 * Scheduler entry (installed by `wakeup_install` into cron / schtasks):
 *
 *   node runner.cjs trigger --scheduled [--cooldown-ms N]
 *
 * Auto-login callback server (spawned detached by `loginStart`):
 *
 *   node runner.cjs login-wait
 */

import {
  getQuota,
  getAllQuotas,
  accountsList,
  accountsCurrent,
  accountsSwitch,
  accountsRemove,
  accountsRefresh,
  accountsAdd,
  loginStart,
  loginWait,
  loginCancel,
  doctor,
  wakeupConfig,
  wakeupInstall,
  wakeupUninstall,
  wakeupTest,
  wakeupHistory,
  wakeupStatus,
  scheduledTrigger,
} from './methods'

const RUNNER_PATH = process.argv[1] ?? ''

type Handler = (args: Record<string, never>) => unknown

const IPC_HANDLERS: Record<string, Handler> = {
  get_quota: (a) => getQuota(a),
  get_all_quotas: (a) => getAllQuotas(a.refresh as boolean | undefined),
  accounts_list: () => accountsList(),
  accounts_current: () => accountsCurrent(),
  accounts_switch: (a) => accountsSwitch(a.email as string),
  accounts_remove: (a) => accountsRemove(a.email as string),
  accounts_refresh: (a) => accountsRefresh(a.email as string | undefined),
  accounts_add: (a) => accountsAdd(a.manualUrl as string),
  login_start: (a) => loginStart(a.manual as boolean, RUNNER_PATH),
  login_cancel: () => loginCancel(),
  doctor: () => doctor(),
  wakeup_config: () => wakeupConfig(),
  wakeup_install: (a) =>
    wakeupInstall(
      a.config as Parameters<typeof wakeupInstall>[0],
      a.cooldownMs as number | undefined,
      RUNNER_PATH,
    ),
  wakeup_uninstall: () => wakeupUninstall(),
  wakeup_test: (a) =>
    wakeupTest(a.email as string, a.model as string, a.prompt as string | undefined),
  wakeup_history: (a) => wakeupHistory(a.limit as number | undefined),
  wakeup_status: () => wakeupStatus(),
};

function parseArgs(raw: string | undefined): Record<string, never> {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, never>
  } catch {
    // Last resort: treat the raw token as a single positional value.
    return { value: raw } as unknown as Record<string, never>
  }
}

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main(): Promise<void> {
  const mode = process.argv[2]

  if (mode === 'trigger' && process.argv[3] === '--scheduled') {
    const cooldownMs = flag('--cooldown-ms')
    const result = await scheduledTrigger(cooldownMs ? Number(cooldownMs) : undefined)
    process.stdout.write(JSON.stringify({ ok: true, result }) + '\n')
    return
  }

  if (mode === 'login-wait') {
    const email = await loginWait()
    process.stdout.write(JSON.stringify({ ok: true, result: email }) + '\n')
    return
  }

  const handler = IPC_HANDLERS[mode]
  if (!handler) {
    throw new Error(
      `Unknown backend method: ${mode ?? '(none)'} (expected one of ${Object.keys(IPC_HANDLERS).join(', ')}, trigger --scheduled, login-wait)`,
    )
  }
  const result = await handler(parseArgs(process.argv[3]))
  process.stdout.write(JSON.stringify({ ok: true, result }) + '\n')
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  process.stdout.write(JSON.stringify({ ok: false, error: message }) + '\n')
  process.exitCode = 1
})
