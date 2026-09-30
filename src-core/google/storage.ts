/**
 * Token storage - file-based implementation
 * 
 * This module provides backward-compatible token storage.
 * It routes to the active account in the new multi-account structure.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { dirname } from 'node:path'
import { getTokensPath, getConfigDir, getAccountDir } from '../core/env'
import { debug } from '../core/logger'
import { 
  getActiveAccountEmail,
  setActiveAccountEmail
} from '../accounts/config'
import {
  saveAccountTokens,
  loadAccountTokens,
  deleteAccount,
  accountExists
} from '../accounts/storage'
import type { StoredTokens } from '../quota/types'

/**
 * Save tokens to disk
 * Routes to active account in multi-account structure
 */
export function saveTokens(tokens: StoredTokens): void {
  const email = tokens.email
  
  if (!email) {
    // Fallback to legacy storage if no email
    const path = getTokensPath()
    const dir = dirname(path)
    
    debug('storage', `Saving tokens to legacy path ${path}`)
    
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    
    writeFileSync(path, JSON.stringify(tokens, null, 2), { mode: 0o600 })
    return
  }
  
  // Use multi-account storage
  debug('storage', `Saving tokens for account ${email}`)
  saveAccountTokens(email, tokens)
  
  // Set as active if no active account
  if (!getActiveAccountEmail()) {
    setActiveAccountEmail(email)
  }
}

/**
 * Load tokens from disk
 * First tries active account, then falls back to legacy path
 */
export function loadTokens(): StoredTokens | null {
  // Try active account first
  const activeEmail = getActiveAccountEmail()
  
  if (activeEmail) {
    const tokens = loadAccountTokens(activeEmail)
    if (tokens) {
      debug('storage', `Loaded tokens for active account ${activeEmail}`)
      return tokens
    }
  }
  
  // Fallback to legacy path
  const legacyPath = getTokensPath()
  
  debug('storage', `Loading tokens from legacy path ${legacyPath}`)
  
  if (!existsSync(legacyPath)) {
    debug('storage', 'No tokens file found')
    return null
  }
  
  try {
    const content = readFileSync(legacyPath, 'utf-8')
    const tokens = JSON.parse(content) as StoredTokens
    debug('storage', 'Tokens loaded successfully from legacy path')
    return tokens
  } catch (err) {
    debug('storage', 'Failed to parse tokens file', err)
    return null
  }
}

/**
 * Delete stored tokens
 * Removes active account in multi-account structure
 */
export function deleteTokens(): boolean {
  const activeEmail = getActiveAccountEmail()
  
  if (activeEmail && accountExists(activeEmail)) {
    debug('storage', `Deleting account ${activeEmail}`)
    return deleteAccount(activeEmail)
  }
  
  // Fallback to legacy path
  const path = getTokensPath()
  
  debug('storage', `Deleting tokens at legacy path ${path}`)
  
  if (!existsSync(path)) {
    debug('storage', 'No tokens file to delete')
    return false
  }
  
  try {
    unlinkSync(path)
    debug('storage', 'Tokens deleted successfully')
    return true
  } catch (err) {
    debug('storage', 'Failed to delete tokens', err)
    return false
  }
}

/**
 * Check if tokens exist
 */
export function hasTokens(): boolean {
  // Check active account
  const activeEmail = getActiveAccountEmail()
  if (activeEmail && accountExists(activeEmail)) {
    return true
  }
  
  // Fallback to legacy
  return existsSync(getTokensPath())
}

/**
 * Get config directory info for doctor command
 */
export function getStorageInfo(): { configDir: string; tokensPath: string; exists: boolean } {
  const configDir = getConfigDir()
  const activeEmail = getActiveAccountEmail()
  
  // Prefer active account path
  let tokensPath: string
  let exists: boolean
  
  if (activeEmail) {
    tokensPath = `${getAccountDir(activeEmail)}/tokens.json`
    exists = accountExists(activeEmail)
  } else {
    tokensPath = getTokensPath()
    exists = existsSync(tokensPath)
  }
  
  return {
    configDir,
    tokensPath,
    exists
  }
}
