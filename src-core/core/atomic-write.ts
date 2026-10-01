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
import {
  closeSync,
  fchmodSync,
  fsyncSync,
  openSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { randomBytes } from 'node:crypto'

/**
 * Windows refuses to replace a file while another process holds it open (a
 * reader mid-read, an antivirus scan); brief holds clear within the retries.
 */
const RETRYABLE_RENAME = new Set(['EPERM', 'EACCES', 'EBUSY'])
const RENAME_ATTEMPTS = 10
const RENAME_BACKOFF_MS = 20

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function isRetryable(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException).code
  return !!code && RETRYABLE_RENAME.has(code)
}

function renameWithRetry(from: string, to: string): void {
  for (let attempt = 1; ; attempt++) {
    try {
      renameSync(from, to)
      return
    } catch (err) {
      if (attempt >= RENAME_ATTEMPTS || !isRetryable(err)) throw err
      sleepSync(RENAME_BACKOFF_MS * attempt)
    }
  }
}

/** The existing file's permission bits (POSIX), so a rewrite keeps them. */
function existingMode(path: string): number | undefined {
  if (process.platform === 'win32') return undefined // only a read-only flag; copying it would block the next write
  try {
    return statSync(path).mode & 0o7777
  } catch {
    return undefined
  }
}

/**
 * Replace `path` with `data` atomically. `mode` applies to the new file;
 * without it an existing file's permissions are kept (POSIX), else
 * 0o666 minus umask like `writeFileSync`. The parent directory must exist.
 */
export function writeFileAtomicSync(path: string, data: string, options: { mode?: number } = {}): void {
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  const preserved = options.mode === undefined ? existingMode(path) : undefined
  const mode = options.mode ?? preserved ?? 0o666
  try {
    const fd = openSync(tmp, 'w', mode)
    try {
      // umask may have stripped bits from the existing file's mode.
      if (preserved !== undefined) fchmodSync(fd, preserved)
      const buf = Buffer.from(data, 'utf8')
      for (let off = 0; off < buf.length; ) off += writeSync(fd, buf, off, buf.length - off)
      // Flush before the rename so a crash can't leave an empty file behind
      // the new name.
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
  } catch (err) {
    removeQuietly(tmp)
    throw err
  }
  try {
    renameWithRetry(tmp, path)
  } catch (err) {
    removeQuietly(tmp)
    // Windows: a handle held open past the retries (antivirus, backup tool,
    // editor) blocks the rename. Fall back to the old in-place write, which
    // that handle does not block, so the save is never lost; atomicity is
    // given up only in this case.
    if (process.platform === 'win32' && isRetryable(err)) {
      writeFileSync(path, data, { mode })
      return
    }
    throw err
  }
}

function removeQuietly(path: string): void {
  try {
    unlinkSync(path)
  } catch {
    // never created
  }
}
