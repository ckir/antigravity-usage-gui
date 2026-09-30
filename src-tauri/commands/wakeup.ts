import { invoke } from '@tauri-apps/api/core'
import type { TriggerRecord, TriggerResult, WakeupConfig } from '../../src-core/wakeup/types'

export type { WakeupConfig }

/**
 * Wakeup scheduler status for the Status card.
 * Served by the `wakeup_status` Rust handler (Task 5); combines the stored
 * config flag, native scheduler state (cron/schtasks), and last history row.
 */
export interface WakeupStatus {
  enabled: boolean
  installed: boolean
  cronExpression?: string
  nextRun?: string
  lastResult?: TriggerRecord | null
}

export interface TestTriggerArgs {
  email: string
  model: string
  prompt?: string
}

/** Stored wakeup config (mirrors CLI `wakeup config`; null when never configured). */
export const getWakeupConfig = (): Promise<WakeupConfig | null> => invoke('wakeup_config')

/** Persist config + install to the native scheduler (cron mac/Linux, schtasks Windows). */
export const installWakeup = (config: WakeupConfig): Promise<void> =>
  invoke('wakeup_install', { config })

export const uninstallWakeup = (): Promise<void> => invoke('wakeup_uninstall')

/** Manual single-model trigger (prompt defaults to "hi" backend-side). */
export const testTrigger = (args: TestTriggerArgs): Promise<TriggerResult> =>
  invoke('wakeup_test', { email: args.email, model: args.model, prompt: args.prompt })

export const getWakeupStatus = (): Promise<WakeupStatus> => invoke('wakeup_status')

export const getWakeupHistory = (limit = 10): Promise<TriggerRecord[]> =>
  invoke('wakeup_history', { limit })
