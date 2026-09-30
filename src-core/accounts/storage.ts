/**
 * Account storage - file-based operations for multi-account
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { getAccountsDir, getAccountDir } from '../core/env'
import { debug } from '../core/logger'
import type { StoredTokens } from '../quota/types'
import type { AccountMetadata, CachedQuota } from './types'

/**
 * Ensure accounts directory exists
 */
export function ensureAccountsDir(): void {
  const dir = getAccountsDir()
  if (!existsSync(dir)) {
    debug('accounts-storage', `Creating accounts directory: ${dir}`)
    mkdirSync(dir, { recursive: true })
  }
}

/**
 * Ensure specific account directory exists
 */
export function ensureAccountDir(email: string): void {
  ensureAccountsDir()
  const dir = getAccountDir(email)
  if (!existsSync(dir)) {
    debug('accounts-storage', `Creating account directory: ${dir}`)
    mkdirSync(dir, { recursive: true })
  }
}

/**
 * Check if an account exists
 */
export function accountExists(email: string): boolean {
  const dir = getAccountDir(email)
  return existsSync(dir) && existsSync(join(dir, 'tokens.json'))
}

/**
 * List all account directories (by email)
 */
export function listAccountEmails(): string[] {
  const accountsDir = getAccountsDir()
  
  if (!existsSync(accountsDir)) {
    return []
  }
  
  try {
    const entries = readdirSync(accountsDir, { withFileTypes: true })
    const emails: string[] = []
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Check if it has a tokens.json file
        const tokensPath = join(accountsDir, entry.name, 'tokens.json')
        if (existsSync(tokensPath)) {
          emails.push(entry.name)
        }
      }
    }
    
    return emails
  } catch (err) {
    debug('accounts-storage', 'Failed to list accounts', err)
    return []
  }
}

// ============================================================
// Token operations
// ============================================================

/**
 * Save tokens for an account
 */
export function saveAccountTokens(email: string, tokens: StoredTokens): void {
  ensureAccountDir(email)
  const path = join(getAccountDir(email), 'tokens.json')
  
  debug('accounts-storage', `Saving tokens for ${email}`)
  writeFileSync(path, JSON.stringify(tokens, null, 2), { mode: 0o600 })
}

/**
 * Load tokens for an account
 */
export function loadAccountTokens(email: string): StoredTokens | null {
  const path = join(getAccountDir(email), 'tokens.json')
  
  if (!existsSync(path)) {
    debug('accounts-storage', `No tokens file for ${email}`)
    return null
  }
  
  try {
    const content = readFileSync(path, 'utf-8')
    return JSON.parse(content) as StoredTokens
  } catch (err) {
    debug('accounts-storage', `Failed to parse tokens for ${email}`, err)
    return null
  }
}

// ============================================================
// Metadata operations
// ============================================================

/**
 * Save metadata for an account
 */
export function saveAccountMetadata(email: string, metadata: AccountMetadata): void {
  ensureAccountDir(email)
  const path = join(getAccountDir(email), 'metadata.json')
  
  debug('accounts-storage', `Saving metadata for ${email}`)
  writeFileSync(path, JSON.stringify(metadata, null, 2), { mode: 0o600 })
}

/**
 * Load metadata for an account
 */
export function loadAccountMetadata(email: string): AccountMetadata | null {
  const path = join(getAccountDir(email), 'metadata.json')
  
  if (!existsSync(path)) {
    return null
  }
  
  try {
    const content = readFileSync(path, 'utf-8')
    return JSON.parse(content) as AccountMetadata
  } catch (err) {
    debug('accounts-storage', `Failed to parse metadata for ${email}`, err)
    return null
  }
}

/**
 * Update lastUsed timestamp for an account
 */
export function updateLastUsed(email: string): void {
  const metadata = loadAccountMetadata(email)
  if (metadata) {
    metadata.lastUsed = new Date().toISOString()
    saveAccountMetadata(email, metadata)
  }
}

// ============================================================
// Cache operations
// ============================================================

/**
 * Save cached quota for an account
 */
export function saveAccountCache(email: string, cache: CachedQuota): void {
  ensureAccountDir(email)
  const path = join(getAccountDir(email), 'cache.json')
  
  debug('accounts-storage', `Saving cache for ${email}`)
  writeFileSync(path, JSON.stringify(cache, null, 2))
}

/**
 * Load cached quota for an account
 */
export function loadAccountCache(email: string): CachedQuota | null {
  const path = join(getAccountDir(email), 'cache.json')
  
  if (!existsSync(path)) {
    return null
  }
  
  try {
    const content = readFileSync(path, 'utf-8')
    return JSON.parse(content) as CachedQuota
  } catch (err) {
    debug('accounts-storage', `Failed to parse cache for ${email}`, err)
    return null
  }
}

/**
 * Delete cache for an account
 */
export function deleteAccountCache(email: string): void {
  const path = join(getAccountDir(email), 'cache.json')
  
  if (existsSync(path)) {
    try {
      rmSync(path)
      debug('accounts-storage', `Deleted cache for ${email}`)
    } catch (err) {
      debug('accounts-storage', `Failed to delete cache for ${email}`, err)
    }
  }
}

// ============================================================
// Account deletion
// ============================================================

/**
 * Delete an account and all its data
 */
export function deleteAccount(email: string): boolean {
  const dir = getAccountDir(email)
  
  if (!existsSync(dir)) {
    debug('accounts-storage', `Account ${email} does not exist`)
    return false
  }
  
  try {
    rmSync(dir, { recursive: true, force: true })
    debug('accounts-storage', `Deleted account ${email}`)
    return true
  } catch (err) {
    debug('accounts-storage', `Failed to delete account ${email}`, err)
    return false
  }
}
