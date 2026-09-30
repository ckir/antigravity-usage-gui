import type { ModelQuotaInfo } from '../../src-core/quota/types'

/**
 * Normalize upstream `remainingPercentage` to a 0-100 display percent.
 * Both upstream parsers (google/parser, local/local-parser) store the raw
 * `remainingFraction` (0-1) in this field, so values in [0,1] are fractions.
 * Normalization lives here at the consumption boundary — parser field
 * semantics are left untouched for other tasks.
 */
export function toDisplayPercent(raw?: number): number | undefined {
  if (raw === undefined) return undefined
  if (raw >= 0 && raw <= 1) return raw * 100
  return raw
}

/** Progress bar color: >=50 green, >=20 amber, else red (0-100 scale). */
export function quotaBarColor(remainingPercentage?: number): string {
  const pct = toDisplayPercent(remainingPercentage)
  if (pct === undefined) return 'bg-gray-400'
  if (pct >= 50) return 'bg-green-500'
  if (pct >= 20) return 'bg-amber-500'
  return 'bg-red-500'
}

/** Human countdown from ms until reset (e.g. "3h 12m", "45m", "30s"). */
export function formatResetCountdown(timeUntilResetMs?: number): string {
  if (timeUntilResetMs === undefined) return '—'
  const totalSeconds = Math.max(0, Math.floor(timeUntilResetMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

export interface QuotaCardProps {
  model: ModelQuotaInfo
  stale?: boolean
}

export default function QuotaCard({ model, stale = false }: QuotaCardProps) {
  const pct = toDisplayPercent(model.remainingPercentage)
  return (
    <article data-testid={`quota-card-${model.modelId}`}>
      <header>
        <h3>{model.label}</h3>
        {stale && <span data-testid="stale-badge">stale</span>}
        {model.isExhausted && <span data-testid="exhausted-badge">exhausted</span>}
      </header>
      <div
        role="progressbar"
        aria-valuenow={pct ?? 0}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          data-testid="quota-bar"
          className={quotaBarColor(model.remainingPercentage)}
          style={{ width: `${pct ?? 0}%` }}
        />
      </div>
      <p data-testid="quota-remaining">
        {pct !== undefined ? `${pct.toFixed(1)}% left` : 'usage unknown'}
      </p>
      <p data-testid="quota-reset">
        resets in {formatResetCountdown(model.timeUntilResetMs)}
      </p>
    </article>
  )
}
