/**
 * Account manager - orchestrates multi-account operations
 */

import { debug } from '../core/logger'
import { 
  listAccountEmails, 
  loadAccountTokens, 
  saveAccountTokens,
  loadAccountMetadata,
  saveAccountMetadata,
  accountExists,
  deleteAccount as deleteAccountDir,
  updateLastUsed
} from './storage'
import { 
  getActiveAccountEmail, 
  setActiveAccountEmail 
} from './config'
import { 
  isCacheValid, 
  loadCacheWithMeta,
  getCacheAge
} from './cache'
import type { StoredTokens } from '../quota/types'
import type { 
  AccountInfo, 
  AccountMetadata, 
  AccountStatus, 
  AccountSummary 
} from './types'

// Refresh token 5 minutes before expiry
const EXPIRY_BUFFER_MS = 5 * 60 * 1000

/**
 * Account Manager - singleton class for managing multiple accounts
 */
export class AccountManager {
  private static instance: AccountManager | null = null
  
  private constructor() {}
  
  static getInstance(): AccountManager {
    if (!AccountManager.instance) {
      AccountManager.instance = new AccountManager()
    }
    return AccountManager.instance
  }
  
  /**
   * Reset instance (for testing)
   */
  static resetInstance(): void {
    AccountManager.instance = null
  }
  
  /**
   * Get all account emails
   */
  getAccountEmails(): string[] {
    return listAccountEmails()
  }
  
  /**
   * Get active account email
   */
  getActiveEmail(): string | null {
    return getActiveAccountEmail()
  }
  
  /**
   * Set active account
   */
  setActiveAccount(email: string): boolean {
    if (!accountExists(email)) {
      debug('account-manager', `Account ${email} does not exist`)
      return false
    }
    
    setActiveAccountEmail(email)
    updateLastUsed(email)
    debug('account-manager', `Switched to account ${email}`)
    return true
  }
  
  /**
   * Check if an account exists
   */
  hasAccount(email: string): boolean {
    return accountExists(email)
  }
  
  /**
   * Get account status
   */
  getAccountStatus(email: string): AccountStatus {
    const tokens = loadAccountTokens(email)
    
    if (!tokens) {
      return 'invalid'
    }
    
    // Check if token is expired
    const now = Date.now()
    if (now >= tokens.expiresAt - EXPIRY_BUFFER_MS) {
      // Expired, but might have refresh token
      if (tokens.refreshToken) {
        return 'expired'  // Can be refreshed
      }
      return 'invalid'
    }
    
    return 'valid'
  }
  
  /**
   * Get detailed account info
   */
  getAccountInfo(email: string): AccountInfo | null {
    if (!accountExists(email)) {
      return null
    }
    
    const activeEmail = getActiveAccountEmail()
    const tokens = loadAccountTokens(email)
    const metadata = loadAccountMetadata(email)
    const cache = loadCacheWithMeta(email)
    const status = this.getAccountStatus(email)
    
    return {
      email,
      isActive: email === activeEmail,
      tokens,
      metadata,
      cache,
      status
    }
  }
  
  /**
   * Get account summaries for list display
   */
  getAccountSummaries(): AccountSummary[] {
    const emails = this.getAccountEmails()
    const activeEmail = getActiveAccountEmail()
    
    return emails.map(email => {
      const metadata = loadAccountMetadata(email)
      const cache = loadCacheWithMeta(email)
      const status = this.getAccountStatus(email)
      
      // Extract credits from cache if available
      let cachedCredits: { used: number; limit: number } | null = null
      if (cache?.data?.promptCredits) {
        const pc = cache.data.promptCredits
        cachedCredits = {
          used: pc.monthly - pc.available,
          limit: pc.monthly
        }
      }
      
      return {
        email,
        isActive: email === activeEmail,
        status,
        lastUsed: metadata?.lastUsed || null,
        cachedCredits
      }
    })
  }
  
  /**
   * Add a new account after successful OAuth
   */
  addAccount(tokens: StoredTokens, email: string): void {
    debug('account-manager', `Adding account ${email}`)
    
    // Save tokens
    saveAccountTokens(email, tokens)
    
    // Create metadata
    const now = new Date().toISOString()
    const metadata: AccountMetadata = {
      email,
      addedAt: now,
      lastUsed: now
    }
    saveAccountMetadata(email, metadata)
    
    // Set as active account
    setActiveAccountEmail(email)
    
    debug('account-manager', `Account ${email} added and set as active`)
  }
  
  /**
   * Update tokens for existing account
   */
  updateTokens(email: string, tokens: StoredTokens): void {
    if (!accountExists(email)) {
      debug('account-manager', `Cannot update tokens: account ${email} does not exist`)
      return
    }
    
    saveAccountTokens(email, tokens)
    updateLastUsed(email)
    debug('account-manager', `Updated tokens for ${email}`)
  }
  
  /**
   * Remove an account
   */
  removeAccount(email: string): boolean {
    if (!accountExists(email)) {
      debug('account-manager', `Account ${email} does not exist`)
      return false
    }
    
    // If removing active account, clear active
    const activeEmail = getActiveAccountEmail()
    if (email === activeEmail) {
      setActiveAccountEmail(null)
    }
    
    const deleted = deleteAccountDir(email)
    
    // If we deleted the active and there are other accounts, set first as active
    if (deleted && email === activeEmail) {
      const remaining = this.getAccountEmails()
      if (remaining.length > 0) {
        setActiveAccountEmail(remaining[0])
        debug('account-manager', `Set ${remaining[0]} as new active account`)
      }
    }
    
    return deleted
  }
  
  /**
   * Remove all accounts
   */
  removeAllAccounts(): number {
    const emails = this.getAccountEmails()
    let count = 0
    
    for (const email of emails) {
      if (deleteAccountDir(email)) {
        count++
      }
    }
    
    setActiveAccountEmail(null)
    debug('account-manager', `Removed ${count} accounts`)
    
    return count
  }
  
  /**
   * Get tokens for an account
   */
  getTokens(email: string): StoredTokens | null {
    return loadAccountTokens(email)
  }
  
  /**
   * Get tokens for active account
   */
  getActiveTokens(): StoredTokens | null {
    const email = getActiveAccountEmail()
    if (!email) {
      return null
    }
    return loadAccountTokens(email)
  }
  
  /**
   * Check if cache is valid for an account
   */
  isCacheValid(email: string): boolean {
    return isCacheValid(email)
  }
  
  /**
   * Get cache age in seconds
   */
  getCacheAge(email: string): number | null {
    return getCacheAge(email)
  }
}

/**
 * Get account manager instance
 */
export function getAccountManager(): AccountManager {
  return AccountManager.getInstance()
}
