/**
 * Type definitions for multi-account support
 */

import type { StoredTokens, QuotaSnapshot } from '../quota/types'

/**
 * Global configuration stored in config.json
 */
export interface GlobalConfig {
  version: string
  activeAccount: string | null
  preferences: ConfigPreferences
}

/**
 * User preferences
 */
export interface ConfigPreferences {
  cacheTTL: number  // seconds, default 300 (5 minutes)
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: GlobalConfig = {
  version: '2.0',
  activeAccount: null,
  preferences: {
    cacheTTL: 300
  }
}

/**
 * Per-account metadata stored in metadata.json
 */
export interface AccountMetadata {
  email: string
  addedAt: string  // ISO date string
  lastUsed: string  // ISO date string
}

/**
 * Cached quota data stored in cache.json
 */
export interface CachedQuota {
  cachedAt: string  // ISO date string
  ttl: number       // seconds
  data: QuotaSnapshot | null
}

/**
 * Account info returned by account manager
 */
export interface AccountInfo {
  email: string
  isActive: boolean
  metadata: AccountMetadata | null
  tokens: StoredTokens | null
  cache: CachedQuota | null
  status: AccountStatus
}

/**
 * Account status for display
 */
export type AccountStatus = 'valid' | 'expired' | 'invalid'

/**
 * Account summary for list display
 */
export interface AccountSummary {
  email: string
  isActive: boolean
  status: AccountStatus
  lastUsed: string | null
  cachedCredits?: {
    used: number
    limit: number
  } | null
}
