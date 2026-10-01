/**
 * Backend method tests (Task 5). All cases run against an isolated config
 * dir (APPDATA/XDG_CONFIG_HOME pointed at a tmp dir) and touch no network:
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
  scheduledCommand,
} from './methods'

let configRoot: string
let savedAppData: string | undefined
let savedXdg: string | undefined

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
  savedAppData = process.env.APPDATA
  savedXdg = process.env.XDG_CONFIG_HOME
  configRoot = await fs.mkdtemp(join(tmpdir(), 'ag-gui-test-'))
  process.env.APPDATA = configRoot
  process.env.XDG_CONFIG_HOME = configRoot
  AccountManager.resetInstance()
  await fs.rm(join(tmpdir(), 'antigravity-gui-login.json'), { force: true })
})

afterEach(async () => {
  if (savedAppData === undefined) delete process.env.APPDATA
  else process.env.APPDATA = savedAppData
  if (savedXdg === undefined) delete process.env.XDG_CONFIG_HOME
  else process.env.XDG_CONFIG_HOME = savedXdg
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
    expect(scheduledCommand('runner.cjs', 1).startsWith(`"${process.execPath}" "runner.cjs" `)).toBe(true)
  })
})
