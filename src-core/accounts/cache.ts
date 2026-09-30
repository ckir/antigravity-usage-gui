/**
 * Cache management for quota data
 */

import { loadAccountCache, saveAccountCache, deleteAccountCache } from './storage'
import { getCacheTTL } from './config'
import { debug } from '../core/logger'
import type { QuotaSnapshot } from '../quota/types'
import type { CachedQuota } from './types'

/**
 * Check if cache is valid for an account.
 * Pass `mtimeMs` (cache write time in ms) to check validity without touching
 * the filesystem (used by tests); otherwise the stored cache entry is read.
 */
export function isCacheValid(email: string, mtimeMs?: number): boolean {
  if (mtimeMs !== undefined) {
    const ttlMs = getCacheTTL() * 1000
    const isValid = Date.now() - mtimeMs < ttlMs
    debug('cache', `Cache for ${email} is ${isValid ? 'valid' : 'stale'}`)
    return isValid
  }

  const cache = loadAccountCache(email)
  
  if (!cache || !cache.data) {
    debug('cache', `No valid cache for ${email}`)
    return false
  }
  
  const cachedAt = new Date(cache.cachedAt).getTime()
  const ttlMs = cache.ttl * 1000
  const now = Date.now()
  
  const isValid = (now - cachedAt) < ttlMs
  debug('cache', `Cache for ${email} is ${isValid ? 'valid' : 'stale'}`)
  
  return isValid
}

/**
 * Get cache age in seconds
 */
export function getCacheAge(email: string): number | null {
  const cache = loadAccountCache(email)
  
  if (!cache) {
    return null
  }
  
  const cachedAt = new Date(cache.cachedAt).getTime()
  return Math.floor((Date.now() - cachedAt) / 1000)
}

/**
 * Save quota data to cache
 */
export function saveCache(email: string, data: QuotaSnapshot): void {
  const ttl = getCacheTTL()
  
  const cache: CachedQuota = {
    cachedAt: new Date().toISOString(),
    ttl,
    data
  }
  
  saveAccountCache(email, cache)
  debug('cache', `Cached quota for ${email}, TTL: ${ttl}s`)
}

/**
 * Load cached quota data
 */
export function loadCache(email: string): QuotaSnapshot | null {
  const cache = loadAccountCache(email)
  return cache?.data || null
}

/**
 * Load cache with metadata
 */
export function loadCacheWithMeta(email: string): CachedQuota | null {
  return loadAccountCache(email)
}

/**
 * Invalidate cache for an account
 */
export function invalidateCache(email: string): void {
  deleteAccountCache(email)
  debug('cache', `Invalidated cache for ${email}`)
}
