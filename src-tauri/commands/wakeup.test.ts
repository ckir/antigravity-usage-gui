import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string) => {
    switch (cmd) {
      case 'wakeup_config':
        return null
      case 'wakeup_status':
        return { enabled: false, installed: false }
      case 'wakeup_history':
        return []
      case 'wakeup_test':
        return { success: true, results: [] }
      default:
        return null
    }
  }),
}))
import { invoke } from '@tauri-apps/api/core'
import {
  getWakeupConfig,
  installWakeup,
  uninstallWakeup,
  testTrigger,
  getWakeupStatus,
  getWakeupHistory,
} from './wakeup'
import { getDefaultConfig } from '../../src-core/wakeup/types'

describe('wakeup IPC', () => {
  it('fetches config, status, and history via invoke', async () => {
    await expect(getWakeupConfig()).resolves.toBeNull()
    await expect(getWakeupStatus()).resolves.toEqual({ enabled: false, installed: false })
    await expect(getWakeupHistory(5)).resolves.toEqual([])
    expect(invoke).toHaveBeenCalledWith('wakeup_config')
    expect(invoke).toHaveBeenCalledWith('wakeup_status')
    expect(invoke).toHaveBeenCalledWith('wakeup_history', { limit: 5 })
  })

  it('installs with the full config and uninstalls', async () => {
    const config = { ...getDefaultConfig(), enabled: true }
    await installWakeup(config)
    // default config carries resetCooldownMinutes: 10 -> resolved to ms in the payload
    expect(invoke).toHaveBeenCalledWith('wakeup_install', { config, cooldownMs: 600_000 })
    await uninstallWakeup()
    expect(invoke).toHaveBeenCalledWith('wakeup_uninstall')
  })

  it('resolves an absent cooldown field to the 1h default on install', async () => {
    // Field present but undefined behaves as absent via ?? (simulates a legacy config).
    const config = { ...getDefaultConfig(), enabled: true, resetCooldownMinutes: undefined as unknown as number }
    await installWakeup(config)
    expect(invoke).toHaveBeenCalledWith('wakeup_install', { config, cooldownMs: 3_600_000 })
  })

  it('sends test-trigger args through', async () => {
    await testTrigger({ email: 'a@x.com', model: 'gemini-3-flash', prompt: 'hi' })
    expect(invoke).toHaveBeenCalledWith('wakeup_test', {
      email: 'a@x.com',
      model: 'gemini-3-flash',
      prompt: 'hi',
    })
  })
})

describe('wakeup trigger retry wiring', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.mocked(invoke).mockClear()
  })

  it('retries a twice-failing testTrigger through backoff (3 attempts)', async () => {
    const mocked = vi.mocked(invoke)
    mocked.mockClear()
    mocked.mockRejectedValueOnce(new Error('net down'))
    mocked.mockRejectedValueOnce(new Error('net down'))
    mocked.mockResolvedValueOnce({ success: true, results: [] })

    const pending = testTrigger({ email: 'a@x.com', model: 'gemini-3-flash', prompt: 'hi' })
    expect(mocked).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1000)
    expect(mocked).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(2000)
    await expect(pending).resolves.toEqual({ success: true, results: [] })
    expect(mocked).toHaveBeenCalledTimes(3)
    expect(mocked).toHaveBeenNthCalledWith(1, 'wakeup_test', {
      email: 'a@x.com',
      model: 'gemini-3-flash',
      prompt: 'hi',
    })
  })
})
