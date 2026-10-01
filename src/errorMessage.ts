/**
 * Human-readable text for a rejected IPC call. Tauri `invoke` rejects with
 * the Rust handler's `Err(String)` as a plain string, not an `Error`, so an
 * `instanceof Error` check alone hides the real cause behind the fallback.
 */
export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'string' && err.trim()) return err
  return fallback
}
