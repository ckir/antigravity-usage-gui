/**
 * Accounts module exports
 */

// Types
export * from './types'

// Storage operations
export {
  ensureAccountsDir,
  ensureAccountDir,
  accountExists,
  listAccountEmails,
  saveAccountTokens,
  loadAccountTokens,
  saveAccountMetadata,
  loadAccountMetadata,
  updateLastUsed,
  saveAccountCache,
  loadAccountCache,
  deleteAccountCache,
  deleteAccount
} from './storage'

// Config operations 
export {
  loadConfig,
  saveConfig,
  getActiveAccountEmail,
  setActiveAccountEmail,
  getCacheTTL
} from './config'

// Cache operations
export {
  isCacheValid,
  getCacheAge,
  saveCache,
  loadCache,
  loadCacheWithMeta,
  invalidateCache
} from './cache'

// Manager
export { 
  AccountManager, 
  getAccountManager 
} from './manager'
