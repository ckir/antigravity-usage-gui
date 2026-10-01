/**
 * Atomic file replacement for the shared JSON state (tokens, metadata,
 * cache, config, wakeup state).
 *
 * GUI-local addition (not upstream): the GUI, the CLI and the OS-scheduled
 * trigger read and write these files concurrently, and a plain
 * `writeFileSync` truncates before writing, so a concurrent reader could
 * see an empty or half-written file (its JSON.parse fails and the account
 * looks logged out). Writing a temp file in the same directory and renaming
 * it over the target means readers see either the old or the new content.
 * Concurrent writers still race: the last rename wins.
 */
import { closeSync, fsyncSync, openSync, renameSync, unlinkSync, writeSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

/**
 * Windows refuses to replace a file another process holds open without
 * delete sharing (an antivirus scan, a reader mid-read); those clear quickly.
 */
const RETRYABLE_RENAME = new Set(['EPERM', 'EACCES', 'EBUSY'])
const RENAME_ATTEMPTS = 10
const RENAME_BACKOFF_MS = 20

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function renameWithRetry(from: string, to: string): void {
  for (let attempt = 1; ; attempt++) {
    try {
      renameSync(from, to)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (attempt >= RENAME_ATTEMPTS || !code || !RETRYABLE_RENAME.has(code)) throw err
      sleepSync(RENAME_BACKOFF_MS * attempt)
    }
  }
}

/**
 * Replace `path` with `data` atomically. `mode` applies to the new file
 * (default 0o666 minus umask, like `writeFileSync`). The parent directory
 * must exist.
 */
export function writeFileAtomicSync(path: string, data: string, options: { mode?: number } = {}): void {
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  try {
    const fd = openSync(tmp, 'w', options.mode ?? 0o666)
    try {
      const buf = Buffer.from(data, 'utf8')
      for (let off = 0; off < buf.length; ) off += writeSync(fd, buf, off, buf.length - off)
      // Flush before the rename so a crash can't leave an empty file behind
      // the new name.
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    renameWithRetry(tmp, path)
  } catch (err) {
    try {
      unlinkSync(tmp)
    } catch {
      // never created, or already renamed
    }
    throw err
  }
}
