import { invoke } from '@tauri-apps/api/core'
import type { QuotaSnapshot, ModelQuotaInfo } from '../../src-core/quota/types'
import type { AllAccountsQuotaResult } from '../../src-tauri/commands/quota'

/** Lowest remaining % across non-autocomplete models, or null when empty. */
export function lowestQuotaPercent(models: ModelQuotaInfo[]): number | null {
  const percents = models
    .filter((m) => !m.isAutocompleteOnly)
    .map((m) => m.remainingPercentage)
    .filter((p): p is number => typeof p === 'number')
  if (percents.length === 0) return null
  return Math.min(...percents)
}

/** One-line tray tooltip for a single snapshot: lowest quota %. */
export function tooltipForSnapshot(snapshot: QuotaSnapshot): string {
  const lowest = lowestQuotaPercent(snapshot.models)
  const email = snapshot.email ? ` (${snapshot.email})` : ''
  return lowest === null
    ? `antigravity-usage${email}: no quota data`
    : `antigravity-usage${email}: ${lowest}% left`
}

/**
 * Tray tooltip across accounts: the lowest quota % and its account,
 * e.g. `antigravity-usage: 12% left (a@x.com)`. Error-only results are
 * skipped; with no usable data a fallback string is returned.
 */
export function buildTrayTooltip(results: AllAccountsQuotaResult[]): string {
  let best: { email: string; percent: number } | null = null
  for (const r of results) {
    if (!r.snapshot) continue
    const lowest = lowestQuotaPercent(r.snapshot.models)
    if (lowest === null) continue
    if (best === null || lowest < best.percent) {
      best = { email: r.email, percent: lowest }
    }
  }
  if (best === null) return 'antigravity-usage: no quota data'
  return `antigravity-usage: ${best.percent}% left (${best.email})`
}

/** Push a tooltip update to the Rust tray icon (see `tray_tooltip` handler). */
export async function setTrayTooltip(tooltip: string): Promise<void> {
  await invoke('tray_tooltip', { tooltip })
}
