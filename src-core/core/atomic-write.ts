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
  lstatSync,
  openSync,
  realpathSync,
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

/** Denied creating the temp file, though the target itself may be writable. */
const PERMISSION = new Set(['EACCES', 'EPERM', 'EROFS'])

function hasCode(err: unknown, codes: Set<string>): boolean {
  const code = (err as NodeJS.ErrnoException).code
  return !!code && codes.has(code)
}

function isRetryable(err: unknown): boolean {
  return hasCode(err, RETRYABLE_RENAME)
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

/**
 * The real file behind `path`, so a symlinked state file (e.g. managed by a
 * dotfiles tool) is updated through the link like `writeFileSync` does,
 * instead of the rename replacing the link with a plain file.
 */
function resolveTarget(path: string): string | null {
  try {
    return realpathSync(path)
  } catch {
    try {
      // A symlink that won't resolve (dangling, looping, inaccessible).
      if (lstatSync(path).isSymbolicLink()) return null
    } catch {
      // not there yet
    }
    return path
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
 *
 * Wherever the atomic path can't be used for a reason the old in-place
 * write might survive (an unresolvable symlink, no permission to create a
 * file next to the target, a rename blocked on Windows), it falls back to
 * that in-place write, so a save never fails where it used to succeed.
 */
export function writeFileAtomicSync(path: string, data: string, options: { mode?: number } = {}): void {
  const target = resolveTarget(path)
  if (target === null) {
    // Let writeFileSync follow the link as before, not replace it.
    writeFileSync(path, data, { mode: options.mode })
    return
  }
  const tmp = `${target}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  const preserved = options.mode === undefined ? existingMode(target) : undefined
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
    // e.g. a read-only directory holding a writable (symlinked) file.
    if (hasCode(err, PERMISSION)) {
      writeFileSync(target, data, { mode })
      return
    }
    throw err
  }
  try {
    renameWithRetry(tmp, target)
  } catch (err) {
    removeQuietly(tmp)
    // Windows: a handle held open past the retries (antivirus, backup tool,
    // editor) blocks the rename. Fall back to the old in-place write, which
    // that handle does not block, so the save is never lost; atomicity is
    // given up only in this case.
    if (process.platform === 'win32' && isRetryable(err)) {
      writeFileSync(target, data, { mode })
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
