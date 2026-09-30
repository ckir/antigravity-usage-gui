import { describe, it, expect, vi } from 'vitest'
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string) => {
    if (cmd === 'doctor') {
      return { env: {}, auth: [], localServer: { running: false }, tips: [] }
    }
    return null
  }),
}))
import { invoke } from '@tauri-apps/api/core'
import { runDoctor } from './doctor'

describe('doctor IPC', () => {
  it('invokes doctor and returns the report', async () => {
    const report = await runDoctor()
    expect(invoke).toHaveBeenCalledWith('doctor')
    expect(report).toEqual({ env: {}, auth: [], localServer: { running: false }, tips: [] })
  })
})
