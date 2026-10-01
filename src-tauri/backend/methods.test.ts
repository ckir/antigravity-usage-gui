/**
 * Backend method tests (Task 5). All cases run against an isolated config
 * dir and touch no network. The config dir comes from APPDATA (Windows),
 * XDG_CONFIG_HOME (Linux) or the home dir (macOS: ~/Library/Application
 * Support, no env override), so all of those point at a tmp dir —
 * `os.homedir()` reads HOME on POSIX and USERPROFILE on Windows.
 * quota paths are exercised through pre-seeded caches, scheduler install
 * paths are NOT covered here (they mutate real crontab/schtasks).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import { getAccountManager, AccountManager } from '../../src-core/accounts/manager'
import { saveCache } from '../../src-core/accounts/cache'
import { saveWakeupConfig } from '../../src-core/wakeup/storage'
import { getDefaultConfig } from '../../src-core/wakeup/types'
import type { QuotaSnapshot } from '../../src-core/quota/types'
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
  loginCancel,
  doctor,
  wakeupConfig,
  wakeupHistory,
  wakeupStatus,
  scheduledTrigger,
  rewriteCronLines,
  planCronRepair,
  scheduledCommand,
} from './methods'

let configRoot: string
const ISOLATED_ENV = ['APPDATA', 'XDG_CONFIG_HOME', 'HOME', 'USERPROFILE'] as const
let savedEnv: Partial<Record<(typeof ISOLATED_ENV)[number], string>>

function snapshot(email: string, remainingPercentage: number): QuotaSnapshot {
  return {
    timestamp: new Date().toISOString(),
    method: 'google',
    email,
    models: [
      {
        label: 'Claude Sonnet',
        modelId: 'claude-sonnet-4-5',
        remainingPercentage,
        isExhausted: false,
      },
    ],
  }
}

beforeEach(async () => {
  configRoot = await fs.mkdtemp(join(tmpdir(), 'ag-gui-test-'))
  savedEnv = {}
  for (const key of ISOLATED_ENV) {
    savedEnv[key] = process.env[key]
    process.env[key] = configRoot
  }
  AccountManager.resetInstance()
  await fs.rm(join(tmpdir(), 'antigravity-gui-login.json'), { force: true })
})

afterEach(async () => {
  for (const key of ISOLATED_ENV) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
  AccountManager.resetInstance()
  await fs.rm(join(tmpdir(), 'antigravity-gui-login.json'), { force: true })
  await fs.rm(configRoot, { recursive: true, force: true })
})

describe('accounts backend', () => {
  it('lists, switches, and removes accounts', () => {
    const manager = getAccountManager()
    manager.addAccount(
      { accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 3600_000 },
      'a@x.com',
    )
    manager.addAccount(
      { accessToken: 'b', refreshToken: 'r', expiresAt: Date.now() + 3600_000 },
      'b@x.com',
    )

    expect(accountsList().sort()).toEqual(['a@x.com', 'b@x.com'])
    expect(accountsCurrent()).toBe('b@x.com')

    accountsSwitch('a@x.com')
    expect(accountsCurrent()).toBe('a@x.com')

    expect(() => accountsSwitch('ghost@x.com')).toThrow(/Unknown account/)
    accountsRemove('a@x.com')
    expect(accountsList()).toEqual(['b@x.com'])
    expect(() => accountsRemove('ghost@x.com')).toThrow(/Unknown account/)
  })

  it('rejects refresh for unknown accounts before any network call', async () => {
    await expect(accountsRefresh('ghost@x.com')).rejects.toThrow(/Unknown account/)
  })
})

describe('quota backend (cache-first)', () => {
  it('serves a valid cache without fetching', async () => {
    getAccountManager().addAccount(
      { accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 3600_000 },
      'a@x.com',
    )
    saveCache('a@x.com', snapshot('a@x.com', 42))

    const got = await getQuota({ account: 'a@x.com' })
    expect(got.models[0].remainingPercentage).toBe(42)
  })

  it('returns cached rows per account, sequentially', async () => {
    for (const email of ['a@x.com', 'b@x.com']) {
      getAccountManager().addAccount(
        { accessToken: 't', refreshToken: 'r', expiresAt: Date.now() + 3600_000 },
        email,
      )
      saveCache(email, snapshot(email, email === 'a@x.com' ? 80 : 15))
    }

    const results = await getAllQuotas(false)
    expect(results.map((r) => [r.email, r.status])).toEqual([
      ['a@x.com', 'cached'],
      ['b@x.com', 'cached'],
    ])
    expect(results[1].snapshot?.models[0].remainingPercentage).toBe(15)
  })

  it('returns an empty list when no accounts exist', async () => {
    await expect(getAllQuotas(false)).resolves.toEqual([])
  })
})

describe('login staging (no network)', () => {
  it('stages a manual login and cancels it', async () => {
    const url = await loginStart(true, 'runner.cjs')
    expect(url).toContain('accounts.google.com')
    await expect(loginCancel()).resolves.toBe(true)
    await expect(loginCancel()).resolves.toBe(false)
  })

  it('refuses to complete a login with no staged state', async () => {
    await expect(accountsAdd('http://127.0.0.1:9/callback?code=x&state=y')).rejects.toThrow(
      /No pending manual login/,
    )
  })
})

describe('doctor backend', () => {
  it('reports env, per-account auth, local server, and tips', async () => {
    const report = await doctor(1500)
    expect(report.env.configDir).toContain('antigravity-usage')
    expect(report.auth).toEqual([])
    expect(typeof report.localServer.running).toBe('boolean')
    expect(report.tips.some((t) => t.includes('No accounts'))).toBe(true)
  })
})

describe('wakeup backend (no scheduler mutation)', () => {
  it('loads config, empty history, and status shapes', async () => {
    expect(wakeupConfig()).toBeNull()
    await expect(wakeupHistory(5)).resolves.toEqual([])

    saveWakeupConfig({ ...getDefaultConfig(), enabled: true })
    expect(wakeupConfig()?.enabled).toBe(true)

    const status = await wakeupStatus()
    expect(status.enabled).toBe(true)
    expect(typeof status.installed).toBe('boolean')
  })

  it('skips the scheduled trigger when never configured', async () => {
    await expect(scheduledTrigger(3_600_000)).resolves.toEqual({
      triggered: false,
      triggeredModels: [],
    })
  })

  it('embeds the install-payload cooldown in the scheduled command', () => {
    const cmd = scheduledCommand('runner.cjs', 600_000)
    expect(cmd).toContain('trigger --scheduled')
    expect(cmd).toContain('--cooldown-ms 600000')
  })

  it('quotes the node path so install dirs with spaces survive /bin/sh', () => {
    expect(scheduledCommand('runner.cjs', 1, {}).startsWith(`"${process.execPath}" "runner.cjs" `)).toBe(true)
  })
})

describe('AppImage cron line', () => {
  const APPIMAGE = '/home/u/My Apps/antigravity-usage-gui.AppImage'
  const MOUNTED = '"/tmp/.mount_abc/usr/bin/agu-node" "/tmp/.mount_abc/usr/lib/antigravity-usage-gui/runner.cjs" trigger --scheduled --cooldown-ms 600000'
  const crontab = (command: string) =>
    ['PATH=/usr/bin:/bin', '0 9 * * * other-job', `*/30 * * * * ${command} # antigravity-usage-wakeup`, ''].join('\n')

  it('re-launches the AppImage file, not the transient mount', () => {
    expect(scheduledCommand('/tmp/.mount_abc/runner.cjs', 600_000, { APPIMAGE })).toBe(
      `"${APPIMAGE}" --wakeup-trigger --cooldown-ms 600000`
    )
  })

  it('rewrites the vendored line and an already-rewritten one, leaving other lines alone', () => {
    const cmd = `"${APPIMAGE}" --wakeup-trigger --cooldown-ms 600000`
    const expected = crontab(cmd)
    expect(rewriteCronLines(crontab('antigravity-usage wakeup trigger --scheduled'), cmd)).toBe(expected)
    expect(rewriteCronLines(crontab(MOUNTED), cmd)).toBe(expected)
  })

  it('leaves a commented-out marker line alone', () => {
    const disabled = `# */30 * * * * ${MOUNTED} # antigravity-usage-wakeup`
    expect(rewriteCronLines(disabled, 'x')).toBe(disabled)
  })

  it('plans a repair that re-points the line and keeps the installed cooldown', () => {
    expect(planCronRepair(crontab(MOUNTED), 3_600_000, { APPIMAGE })).toBe(
      crontab(`"${APPIMAGE}" --wakeup-trigger --cooldown-ms 600000`)
    )
  })

  it('repairs a line for an AppImage that was moved', () => {
    const old = crontab('"/home/u/Downloads/app.AppImage" --wakeup-trigger --cooldown-ms 600000')
    expect(planCronRepair(old, 3_600_000, { APPIMAGE })).toBe(
      crontab(`"${APPIMAGE}" --wakeup-trigger --cooldown-ms 600000`)
    )
  })

  it('falls back to the default cooldown when the line carries none', () => {
    expect(planCronRepair(crontab('antigravity-usage wakeup trigger --scheduled'), 3_600_000, { APPIMAGE })).toBe(
      crontab(`"${APPIMAGE}" --wakeup-trigger --cooldown-ms 3600000`)
    )
  })

  it('does nothing when already current, when not an AppImage, or with no marker line', () => {
    expect(planCronRepair(crontab(`"${APPIMAGE}" --wakeup-trigger --cooldown-ms 600000`), 1, { APPIMAGE })).toBeNull()
    expect(planCronRepair(crontab(MOUNTED), 1, {})).toBeNull()
    expect(planCronRepair('0 9 * * * other-job\n', 1, { APPIMAGE })).toBeNull()
  })
})
