import { describe, it, expect, vi } from 'vitest'
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
    expect(invoke).toHaveBeenCalledWith('wakeup_install', { config })
    await uninstallWakeup()
    expect(invoke).toHaveBeenCalledWith('wakeup_uninstall')
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
