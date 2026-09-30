/**
 * Backend-side scheduled trigger runner (NEW — no upstream equivalent as a
 * module; distills the non-interactive core of upstream
 * `src/commands/wakeup.ts runScheduledTrigger`, minus `inquirer`/`cli-table3`
 * per the CLI-strip rule).
 *
 * Backend-only: imports node-backed vendored modules (`reset-detector` pulls
 * `node:fs`/`node:crypto`/etc. via storage/trigger-service). NEVER import
 * this file from the browser bundle — the Wakeup view talks via Tauri IPC
 * only (Task 3 lesson).
 *
 * Task 5 wiring: call `runScheduledTrigger` from the `wakeup trigger
 * --scheduled` handler / quota-refresh hook with a freshly fetched snapshot.
 * Per-account triggering stays sequential inside the vendored detector
 * (global constraint); wrap this call in `executeWithBackoff` for transient
 * backend failures.
 */

import { detectResetAndTrigger } from './reset-detector'
import { resolveTriggerCooldownMs, type WakeupCooldownSource } from './retry'
import type { DetectionResult } from './types'
import type { QuotaSnapshot } from '../quota/types'

/**
 * Run one quota-reset/scheduled detection pass: resolve the effective
 * cooldown from config and pass it as detector milliseconds. This is the
 * production call the config value flows into.
 */
export async function runScheduledTrigger(
  config: WakeupCooldownSource,
  snapshot: QuotaSnapshot
): Promise<DetectionResult> {
  return detectResetAndTrigger(snapshot, resolveTriggerCooldownMs(config))
}
