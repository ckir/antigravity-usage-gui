/**
 * Backend method implementations for the Tauri IPC handlers (Task 5).
 *
 * BACKEND-ONLY: imports node-backed vendored modules (`node:fs`, `node:http`,
 * `node:child_process`, … via src-core). NEVER import this file — or anything
 * under `src-tauri/backend/` — from the browser bundle (`src/`); the React
 * views talk to these functions exclusively via Tauri `invoke` (Task 3 lesson).
 *
 * Execution model: the Rust shell (`src-tauri/src/main.rs`) spawns a bundled
 * Node sidecar (`dist-backend/runner.cjs`, built by `npm run build:backend`)
 * per invoke: `node runner.cjs <method> '<json-args>'`. Stdout is a single
 * JSON envelope `{ ok: true, result } | { ok: false, error }`. See
 * `src-tauri/backend/runner.ts` for the argv/stdout wrapper and the
 * `trigger --scheduled` cron/schtasks entry point.
 *
 * Contracts honored here:
 * - 5-minute cache-first quota reads; `--account` forces Google (spec §4);
 *   multi-account fetch strictly sequential (global constraint).
 * - Task 4 backoff/cooldown: `wakeup_test` and the scheduled trigger wrap
 *   execution in `executeWithBackoff`; the `wakeup_install` payload
 *   `cooldownMs` is embedded in the installed cron/schtasks command line and
 *   fed straight to `detectResetAndTrigger(snapshot, cooldownMs)`.
 */

import { execFile, exec } from 'node:child_process'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { promisify } from 'node:util'
import { fetchQuota, fetchQuotaForAccount, type QuotaMethod } from '../../src-core/quota/service'
import { getAccountManager } from '../../src-core/accounts/manager'
import { isCacheValid, getCacheAge, saveCache, loadCache } from '../../src-core/accounts/cache'
import { getTokenManagerForAccount } from '../../src-core/google/token-manager'
import {
  buildManualAuthUrl,
  completeManualLogin,
} from '../../src-core/google/oauth'
import {
  detectAntigravityProcess,
  discoverPorts,
  probeForConnectAPI,
} from '../../src-core/local/index'
import { getConfigDir } from '../../src-core/core/env'
import {
  loadWakeupConfig,
  saveWakeupConfig,
  getRecentHistory,
  getLastTrigger,
} from '../../src-core/wakeup/storage'
import type { WakeupConfig } from '../../src-core/wakeup/types'
import { configToCronExpression } from '../../src-core/wakeup/schedule-converter'
import { installCronJob, uninstallCronJob, getCronStatus } from '../../src-core/wakeup/cron-installer'
import { executeTrigger } from '../../src-core/wakeup/trigger-service'
import { detectResetAndTrigger } from '../../src-core/wakeup/reset-detector'
import { buildTaskXml } from '../../src-core/wakeup/windows'
import { executeWithBackoff, resolveTriggerCooldownMs } from '../../src-core/wakeup/retry'
import type { QuotaSnapshot } from '../../src-core/quota/types'

const execFileAsync = promisify(execFile)

// ---------------------------------------------------------------------------
// Quota
// ---------------------------------------------------------------------------

export interface GetQuotaArgs {
  method?: QuotaMethod
  account?: string
  refresh?: boolean
  /** Accepted for CLI parity; display filtering happens frontend-side. */
  allModels?: boolean
}

/** Cache-first single quota fetch (5-min TTL; `refresh` forces fetch). */
export async function getQuota(args: GetQuotaArgs = {}): Promise<QuotaSnapshot> {
  const method = args.method ?? 'auto'
  if (!args.refresh) {
    const candidates = args.account
      ? [args.account]
      : [getAccountManager().getActiveEmail()].filter((e): e is string => !!e)
    for (const email of candidates) {
      if (isCacheValid(email)) {
        const cached = loadCache(email)
        if (cached) return cached
      }
    }
  }
  try {
    const snapshot = args.account
      ? await fetchQuotaForAccount(args.account, method)
      : await fetchQuota(method)
    const email = snapshot.email ?? args.account
    if (email) saveCache(email, snapshot)
    return snapshot
  } catch (err) {
    const candidates = args.account
      ? [args.account]
      : [getAccountManager().getActiveEmail()].filter((e): e is string => !!e)
    for (const email of candidates) {
      const cached = loadCache(email)
      if (cached) return cached
    }
    throw err
  }
}

export interface AllAccountsQuotaResult {
  email: string
  isActive: boolean
  status: 'success' | 'cached' | 'error'
  snapshot?: QuotaSnapshot
  error?: string
  cacheAge?: number
}

/** Sequential per-account fetch (never parallel: token-switch race). */
export async function getAllQuotas(refresh = false): Promise<AllAccountsQuotaResult[]> {
  const manager = getAccountManager()
  const emails = manager.getAccountEmails()
  const active = manager.getActiveEmail()
  const results: AllAccountsQuotaResult[] = []
  for (const email of emails) {
    if (!refresh && isCacheValid(email)) {
      const snapshot = loadCache(email)
      if (snapshot) {
        results.push({
          email,
          isActive: email === active,
          status: 'cached',
          snapshot,
          cacheAge: getCacheAge(email) ?? undefined,
        })
        continue
      }
    }
    try {
      const snapshot = await fetchQuotaForAccount(email, 'auto')
      saveCache(email, snapshot)
      results.push({ email, isActive: email === active, status: 'success', snapshot })
    } catch (err) {
      const cached = loadCache(email)
      if (cached) {
        results.push({
          email,
          isActive: email === active,
          status: 'cached',
          snapshot: cached,
          cacheAge: getCacheAge(email) ?? undefined,
        })
      } else {
        results.push({
          email,
          isActive: email === active,
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }
  return results
}

// ---------------------------------------------------------------------------
// Accounts + login
// ---------------------------------------------------------------------------

export function accountsList(): string[] {
  return getAccountManager().getAccountEmails()
}

export function accountsCurrent(): string | null {
  return getAccountManager().getActiveEmail()
}

export function accountsSwitch(email: string): void {
  if (!getAccountManager().setActiveAccount(email)) {
    throw new Error(`Unknown account: ${email}`)
  }
}

export function accountsRemove(email: string): void {
  if (!getAccountManager().removeAccount(email)) {
    throw new Error(`Unknown account: ${email}`)
  }
}

/** Force a token refresh for one (or all) accounts; returns refreshed emails. */
export async function accountsRefresh(email?: string): Promise<string[]> {
  const manager = getAccountManager()
  const targets = email ? [email] : manager.getAccountEmails()
  const refreshed: string[] = []
  for (const target of targets) {
    if (!manager.hasAccount(target)) throw new Error(`Unknown account: ${target}`)
    await getTokenManagerForAccount(target).refreshToken()
    refreshed.push(target)
  }
  return refreshed
}

interface PendingLogin {
  state: string
  redirectUri: string
  port: number
  mode: 'manual' | 'auto'
  pid?: number
  createdAt: string
}

function pendingLoginPath(): string {
  return join(tmpdir(), 'antigravity-gui-login.json')
}

async function readPendingLogin(): Promise<PendingLogin | null> {
  try {
    return JSON.parse(await fs.readFile(pendingLoginPath(), 'utf-8')) as PendingLogin
  } catch {
    return null
  }
}

async function freePort(): Promise<number> {
  const net = await import('node:net')
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address && typeof address === 'object') {
        const port = address.port
        server.close(() => resolve(port))
      } else {
        reject(new Error('Failed to allocate login port'))
      }
    })
    server.on('error', reject)
  })
}

/**
 * Start a login: returns the Google OAuth URL. Auto mode also spawns a
 * detached `login-wait` sidecar that serves the localhost callback and
 * completes the login; the Rust shell opens the system browser to the URL.
 * Manual mode only stages `{state, redirectUri}` for `accounts_add`.
 */
export async function loginStart(manual: boolean, runnerPath: string): Promise<string> {
  const port = await freePort()
  const redirectUri = `http://127.0.0.1:${port}/callback`
  const state = randomBytes(16).toString('hex')
  const url = buildManualAuthUrl(redirectUri, state)
  if (manual) {
    await fs.writeFile(
      pendingLoginPath(),
      JSON.stringify({ state, redirectUri, port, mode: 'manual', createdAt: new Date().toISOString() } satisfies PendingLogin),
    )
    return url
  }
  const { spawn } = await import('node:child_process')
  const child = spawn(process.execPath, [runnerPath, 'login-wait'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  child.unref()
  await fs.writeFile(
    pendingLoginPath(),
    JSON.stringify({
      state, redirectUri, port, mode: 'auto', pid: child.pid, createdAt: new Date().toISOString(),
    } satisfies PendingLogin),
  )
  return url
}

/** Serve the auto-login localhost callback; run as `runner.cjs login-wait`. */
export async function loginWait(): Promise<string> {
  const pending = await readPendingLogin()
  if (!pending || pending.mode !== 'auto') {
    throw new Error('No pending auto login (call login_start first)')
  }
  const callbackUrl = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const full = `http://127.0.0.1:${pending.port}${req.url ?? '/'}`
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<html><body><h1>Login complete</h1><p>Return to the app.</p></body></html>')
      server.close()
      resolve(full)
    })
    server.listen(pending.port, '127.0.0.1')
    server.on('error', reject)
    setTimeout(() => {
      server.close()
      reject(new Error('Login timed out'))
    }, 2 * 60 * 1000).unref?.()
  })
  const result = await completeManualLogin(callbackUrl, pending.state, pending.redirectUri)
  await fs.rm(pendingLoginPath(), { force: true })
  if (!result.success) throw new Error(result.error ?? 'Login failed')
  return result.email ?? ''
}

/** Abort a pending login (auto sidecar and/or staged manual state). */
export async function loginCancel(): Promise<boolean> {
  const pending = await readPendingLogin()
  if (!pending) return false
  if (pending.pid) {
    try {
      process.kill(pending.pid)
    } catch {
      // already exited
    }
  }
  await fs.rm(pendingLoginPath(), { force: true })
  return true
}

/** Complete a manual (paste-URL) login against staged `login_start` state. */
export async function accountsAdd(manualUrl: string): Promise<string> {
  const pending = await readPendingLogin()
  if (!pending) throw new Error('No pending manual login (call login_start first)')
  const result = await completeManualLogin(manualUrl, pending.state, pending.redirectUri)
  if (!result.success) throw new Error(result.error ?? 'Login failed')
  await fs.rm(pendingLoginPath(), { force: true })
  return result.email ?? ''
}

// ---------------------------------------------------------------------------
// Doctor
// ---------------------------------------------------------------------------

export interface DoctorReport {
  env: Record<string, string>
  auth: { email: string; valid: boolean }[]
  localServer: { running: boolean; port?: number }
  tips: string[]
}

export async function doctor(probeTimeoutMs = 12_000): Promise<DoctorReport> {
  const manager = getAccountManager()
  const emails = manager.getAccountEmails()
  const auth = emails.map((email) => ({
    email,
    valid: manager.getAccountStatus(email) === 'valid',
  }))

  // The local probe scans IDE ports (500ms each) and must never hang doctor.
  const probed = await Promise.race([
    probeLocalServer(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), probeTimeoutMs)),
  ])
  const localServer: DoctorReport['localServer'] = probed ?? { running: false }

  const tips: string[] = []
  if (emails.length === 0) tips.push('No accounts found. Add one via the Accounts view login.')
  for (const a of auth) {
    if (!a.valid) tips.push(`${a.email} needs re-login (token expired or invalid).`)
  }
  if (!localServer.running) {
    tips.push('Antigravity IDE local server not detected. Open the IDE or switch to Google method.')
  }

  return {
    env: {
      platform: process.platform,
      node: process.version,
      configDir: getConfigDir(),
      oauthClient: process.env.ANTIGRAVITY_OAUTH_CLIENT_ID ? 'custom' : 'default',
    },
    auth,
    localServer,
    tips,
  }
}

async function probeLocalServer(): Promise<DoctorReport['localServer'] | null> {
  try {
    const proc = await detectAntigravityProcess()
    if (!proc) return { running: false }
    const ports = await discoverPorts(proc.pid)
    const probe = await probeForConnectAPI(ports, proc.csrfToken)
    if (!probe) return { running: false }
    const match = probe.baseUrl.match(/:(\d+)$/)
    return { running: true, port: match ? Number(match[1]) : undefined }
  } catch {
    return { running: false }
  }
}

// ---------------------------------------------------------------------------
// Wakeup
// ---------------------------------------------------------------------------

const WINDOWS_TASK_NAME = 'AntigravityWakeup'

/** Runner invocation embedded in cron/schtasks, carrying the install payload. */
export function scheduledCommand(runnerPath: string, cooldownMs: number): string {
  return `${process.execPath} "${runnerPath}" trigger --scheduled --cooldown-ms ${cooldownMs}`
}

export function wakeupConfig(): WakeupConfig | null {
  return loadWakeupConfig()
}

export async function wakeupInstall(
  config: WakeupConfig,
  cooldownMs: number | undefined,
  runnerPath: string,
): Promise<void> {
  // Single resolution point lives frontend-side (`installWakeup` in
  // `src-tauri/commands/wakeup.ts`); the payload value wins, the resolver is
  // the fallback so direct invocations stay on the 1h default.
  const effectiveCooldownMs = cooldownMs ?? resolveTriggerCooldownMs(config)
  saveWakeupConfig({ ...config, enabled: true })
  const cronExpression = configToCronExpression(config)

  if (process.platform === 'win32') {
    const xml = buildTaskXml({
      taskName: WINDOWS_TASK_NAME,
      nodePath: process.execPath,
      script: runnerPath,
      dailyTimes: config.dailyTimes,
      intervalHours: config.intervalHours,
    }).replace(
      'trigger --scheduled',
      `trigger --scheduled --cooldown-ms ${effectiveCooldownMs}`,
    )
    const tmp = join(tmpdir(), `${WINDOWS_TASK_NAME}.xml`)
    await fs.writeFile(tmp, xml)
    await execFileAsync('schtasks', ['/Create', '/TN', WINDOWS_TASK_NAME, '/XML', tmp, '/F'])
    return
  }

  const installed = await installCronJob(cronExpression)
  if (!installed.success) {
    throw new Error(installed.error ?? installed.manualInstructions ?? 'Cron install failed')
  }
  // Point the vendored marker line at the GUI sidecar (keeps `getCronStatus`
  // working: it keys off the marker comment, not the command).
  const command = scheduledCommand(runnerPath, effectiveCooldownMs)
  const { stdout } = await execFileAsync('crontab', ['-l']).catch(() => ({ stdout: '' }) as never)
  const lines = String(stdout)
    .split('\n')
    .map((line) =>
      line.includes('antigravity-usage-wakeup') && line.includes('antigravity-usage wakeup trigger')
        ? line.replace('antigravity-usage wakeup trigger --scheduled', command)
        : line,
    )
  await new Promise<void>((resolve, reject) => {
    const proc = exec('crontab -', (err: unknown) => (err ? reject(err) : resolve()))
    proc.stdin?.write(lines.join('\n') + '\n')
    proc.stdin?.end()
  })
}

export async function wakeupUninstall(): Promise<void> {
  const config = loadWakeupConfig()
  if (config) saveWakeupConfig({ ...config, enabled: false })
  if (process.platform === 'win32') {
    try {
      await execFileAsync('schtasks', ['/Delete', '/TN', WINDOWS_TASK_NAME, '/F'])
    } catch {
      // already absent
    }
    return
  }
  await uninstallCronJob()
}

/**
 * Manual single-model trigger (prompt defaults to "hi" backend-side).
 * Retried with exponential backoff (Task 4 contract); the frontend wraps the
 * IPC call the same way, so transient failures are covered on both hops.
 */
export async function wakeupTest(email: string, model: string, prompt?: string) {
  return executeWithBackoff(() =>
    executeTrigger({
      models: [model],
      accountEmail: email,
      triggerType: 'manual',
      triggerSource: 'manual',
      customPrompt: prompt || 'hi',
      maxOutputTokens: 1,
    }),
  )
}

export async function wakeupHistory(limit = 10) {
  return getRecentHistory(limit)
}

export interface WakeupStatus {
  enabled: boolean
  installed: boolean
  cronExpression?: string
  nextRun?: string
  lastResult?: ReturnType<typeof getLastTrigger>
}

export async function wakeupStatus(): Promise<WakeupStatus> {
  const config = loadWakeupConfig()
  if (process.platform === 'win32') {
    let installed = false
    try {
      await execFileAsync('schtasks', ['/Query', '/TN', WINDOWS_TASK_NAME])
      installed = true
    } catch {
      installed = false
    }
    return {
      enabled: config?.enabled ?? false,
      installed,
      cronExpression: config ? configToCronExpression(config) : undefined,
      lastResult: getLastTrigger(),
    }
  }
  const cron = await getCronStatus()
  return {
    enabled: config?.enabled ?? false,
    installed: cron.installed,
    cronExpression: cron.cronExpression,
    nextRun: cron.nextRun,
    lastResult: getLastTrigger(),
  }
}

/**
 * Scheduled entry (`runner.cjs trigger --scheduled [--cooldown-ms N]`):
 * fetch a fresh snapshot, then run quota-reset detection with the install
 * payload cooldown (or the config-resolved 1h default), wrapped in backoff.
 */
export async function scheduledTrigger(cooldownMs?: number) {
  const config = loadWakeupConfig()
  if (!config?.enabled) return { triggered: false, triggeredModels: [] }
  const snapshot = await fetchQuota('auto')
  const effectiveCooldownMs = cooldownMs ?? resolveTriggerCooldownMs(config)
  return executeWithBackoff(() => detectResetAndTrigger(snapshot, effectiveCooldownMs))
}
