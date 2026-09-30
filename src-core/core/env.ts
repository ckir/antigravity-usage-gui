/**
 * Environment and platform utilities
 */

import { homedir, platform } from 'node:os'
import { join } from 'node:path'

export type Platform = 'windows' | 'macos' | 'linux'

/**
 * Get the current platform
 */
export function getPlatform(): Platform {
  const p = platform()
  if (p === 'win32') return 'windows'
  if (p === 'darwin') return 'macos'
  return 'linux'
}

/**
 * Get the config directory for this application
 * - Windows: %APPDATA%/antigravity-usage
 * - Linux: ~/.config/antigravity-usage
 * - macOS: ~/Library/Application Support/antigravity-usage
 */
export function getConfigDir(): string {
  const p = getPlatform()
  const home = homedir()

  switch (p) {
    case 'windows':
      return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'antigravity-usage')
    case 'macos':
      return join(home, 'Library', 'Application Support', 'antigravity-usage')
    case 'linux':
    default:
      return join(process.env.XDG_CONFIG_HOME || join(home, '.config'), 'antigravity-usage')
  }
}

/**
 * Get the path to the tokens file (legacy - single account)
 */
export function getTokensPath(): string {
  return join(getConfigDir(), 'tokens.json')
}

/**
 * Get the accounts directory
 */
export function getAccountsDir(): string {
  return join(getConfigDir(), 'accounts')
}

/**
 * Get the directory for a specific account
 * @param email Account email address
 */
export function getAccountDir(email: string): string {
  // Sanitize email for filesystem (replace special chars)
  const safeName = email.replace(/[^a-zA-Z0-9@._-]/g, '_')
  return join(getAccountsDir(), safeName)
}

/**
 * Get the path to global config file
 */
export function getGlobalConfigPath(): string {
  return join(getConfigDir(), 'config.json')
}
