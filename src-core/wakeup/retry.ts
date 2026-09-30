/**
 * Retry with exponential backoff for wakeup trigger calls.
 *
 * NEW GUI-side addition — no upstream equivalent (upstream `trigger-service.ts`
 * does a single attempt per model with a 30s timeout; `reset-detector.ts`
 * enforces a fixed 1h per-model cooldown). This module is intentionally
 * backend-side (pure TS, no node imports) and is NOT imported by the
 * browser bundle — the Wakeup view talks via Tauri IPC only (Task 3 lesson).
 *
 * Task 5 wiring: wrap the `executeTrigger` calls in the Rust-handler backend
 * (the `wakeup trigger --scheduled` / `wakeup_test` equivalents) with
 * `executeWithBackoff`, e.g.:
 *
 *   import { executeWithBackoff } from '../../src-core/wakeup/retry'
 *   const result = await executeWithBackoff(() => executeTrigger({ ... }))
 *
 * Keep the 1h reset-detector cooldown as the outer dedup gate; backoff here
 * covers transient per-attempt failures (network/API/timeout). Sequential
 * per-account triggering (global constraint) is preserved: wrap each
 * account's `executeTrigger` call individually, never `Promise.all` accounts.
 *
 * Also home to `resolveCooldownMs` below (same Task 5 backend audience).
 */

export interface BackoffOptions {
  /** Total attempts including the first try. Default 3. */
  maxAttempts?: number
  /** Delay before the first retry. Default 1000ms. */
  baseDelayMs?: number
  /** Delay multiplier per retry. Default 2 (1000ms, 2000ms, 4000ms, …). */
  factor?: number
  /** Return false to fail fast on non-transient errors. Default: always retry. */
  shouldRetry?: (error: unknown, attempt: number) => boolean
  /** Observer for logging/retry UI. */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void
}

export const DEFAULT_MAX_ATTEMPTS = 3
export const DEFAULT_BASE_DELAY_MS = 1000
export const DEFAULT_FACTOR = 2

/** Fallback cooldown when the config carries none: 1h, matching upstream. */
export const DEFAULT_COOLDOWN_MINUTES = 60

/**
 * Delay before the retry following `attempt` (1-based) grows exponentially:
 * `baseDelayMs * factor^(attempt-1)`.
 */
export function backoffDelayMs(
  attempt: number,
  baseDelayMs: number = DEFAULT_BASE_DELAY_MS,
  factor: number = DEFAULT_FACTOR
): number {
  return baseDelayMs * Math.pow(factor, attempt - 1)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * Run `fn` until it succeeds or attempts run out, waiting an exponentially
 * growing delay between attempts. Rejects with the last error.
 */
export async function executeWithBackoff<T>(fn: () => Promise<T>, options: BackoffOptions = {}): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS)
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS
  const factor = options.factor ?? DEFAULT_FACTOR

  let attempt = 0
  while (true) {
    attempt += 1
    try {
      return await fn()
    } catch (err) {
      const shouldRetry = options.shouldRetry ? options.shouldRetry(err, attempt) : true
      if (!shouldRetry || attempt >= maxAttempts) {
        throw err
      }
      const delayMs = backoffDelayMs(attempt, baseDelayMs, factor)
      if (options.onRetry) {
        options.onRetry(err, attempt, delayMs)
      }
      await sleep(delayMs)
    }
  }
}

// ============================================================================
// Cooldown mapping: WakeupConfig.resetCooldownMinutes -> detector cooldownMs
// ============================================================================

/**
 * Map the config cooldown to the `cooldownMs` override of
 * `detectResetAndTrigger` (see `reset-detector.ts`).
 *
 * Explicit mapping because the field names AND units differ: the config
 * stores `resetCooldownMinutes` (minutes, default 10 in `getDefaultConfig`)
 * while the detector takes `cooldownMs` (milliseconds, upstream default 1h).
 * Absent/undefined preserves the 1h upstream default.
 *
 * Task 5 wiring: `detectResetAndTrigger(snapshot,
 * resolveCooldownMs(config.resetCooldownMinutes))`.
 */
export function resolveCooldownMs(resetCooldownMinutes?: number): number {
  return Math.max(0, (resetCooldownMinutes ?? DEFAULT_COOLDOWN_MINUTES) * 60_000)
}
