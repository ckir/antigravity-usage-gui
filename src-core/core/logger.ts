/**
 * Logger utility with debug mode support
 */

let debugMode = false

export function setDebugMode(enabled: boolean): void {
  debugMode = enabled
}

export function isDebugMode(): boolean {
  return debugMode
}

export function debug(category: string, message: string, data?: unknown): void {
  if (!debugMode) return

  const timestamp = new Date().toISOString()
  const prefix = `[${timestamp}] [${category}]`

  if (data !== undefined) {
    console.error(`${prefix} ${message}`, data)
  } else {
    console.error(`${prefix} ${message}`)
  }
}

export function info(message: string): void {
  console.log(message)
}

export function warn(message: string): void {
  console.warn(`⚠️  ${message}`)
}

export function error(message: string): void {
  console.error(`❌ ${message}`)
}

export function success(message: string): void {
  console.log(`✅ ${message}`)
}
