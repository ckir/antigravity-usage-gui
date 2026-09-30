/**
 * Token masking utility
 */

/**
 * Mask a token for display, showing first 6 and last 4 characters
 * @example maskToken('abc123xyz789secret') => 'abc123...cret'
 */
export function maskToken(token: string): string {
  if (!token) return ''
  if (token.length <= 10) return '***'

  const first = token.slice(0, 6)
  const last = token.slice(-4)
  return `${first}...${last}`
}

/**
 * Mask an email for display
 * @example maskEmail('user@example.com') => 'us**@example.com'
 */
export function maskEmail(email: string): string {
  if (!email) return ''

  const [local, domain] = email.split('@')
  if (!domain) return email

  if (local.length <= 2) {
    return `${local[0] || ''}**@${domain}`
  }

  return `${local.slice(0, 2)}**@${domain}`
}
