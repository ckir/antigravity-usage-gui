import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  chmodSync,
  closeSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeFileAtomicSync } from './atomic-write'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atomic-write-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('writeFileAtomicSync', () => {
  it('creates a file with the given content', () => {
    const p = join(dir, 'a.json')
    writeFileAtomicSync(p, '{"a":1}')
    expect(readFileSync(p, 'utf8')).toBe('{"a":1}')
  })

  it('replaces existing content and leaves no temp file behind', () => {
    const p = join(dir, 'a.json')
    writeFileSync(p, 'old content that is longer than the new one')
    writeFileAtomicSync(p, 'new')
    expect(readFileSync(p, 'utf8')).toBe('new')
    expect(readdirSync(dir)).toEqual(['a.json'])
  })

  it('writes multi-byte text intact', () => {
    const p = join(dir, 'a.json')
    const text = JSON.stringify({ name: 'Κώστας ✓', big: 'x'.repeat(200_000) })
    writeFileAtomicSync(p, text)
    expect(readFileSync(p, 'utf8')).toBe(text)
  })

  it.skipIf(process.platform === 'win32')('applies the mode to the new file', () => {
    const p = join(dir, 'tokens.json')
    writeFileSync(p, '{}', { mode: 0o644 })
    writeFileAtomicSync(p, '{"t":1}', { mode: 0o600 })
    expect(statSync(p).mode & 0o777).toBe(0o600)
  })

  it.skipIf(process.platform === 'win32')('keeps an existing file mode when none is given', () => {
    const p = join(dir, 'config.json')
    writeFileSync(p, '{}', { mode: 0o640 })
    writeFileAtomicSync(p, '{"c":1}')
    expect(statSync(p).mode & 0o777).toBe(0o640)
  })

  it('writes through a symlink and keeps the link', (ctx) => {
    const real = join(dir, 'dotfiles-config.json')
    const link = join(dir, 'config.json')
    writeFileSync(real, '"old"')
    try {
      symlinkSync(real, link, 'file')
    } catch {
      ctx.skip() // e.g. Windows without Developer Mode
    }
    writeFileAtomicSync(link, '"new"')
    expect(lstatSync(link).isSymbolicLink()).toBe(true)
    expect(readFileSync(real, 'utf8')).toBe('"new"')
    expect(readdirSync(dir).sort()).toEqual(['config.json', 'dotfiles-config.json'])
  })

  it('follows a dangling symlink like writeFileSync instead of replacing it', (ctx) => {
    const real = join(dir, 'not-yet.json')
    const link = join(dir, 'config.json')
    try {
      symlinkSync(real, link, 'file')
    } catch {
      ctx.skip()
    }
    writeFileAtomicSync(link, '"new"')
    expect(lstatSync(link).isSymbolicLink()).toBe(true)
    expect(readFileSync(real, 'utf8')).toBe('"new"')
  })

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'still saves a writable file in a read-only directory',
    () => {
      const ro = join(dir, 'ro')
      mkdirSync(ro)
      const p = join(ro, 'config.json')
      writeFileSync(p, '"old"')
      chmodSync(ro, 0o555)
      try {
        writeFileAtomicSync(p, '"new"')
        expect(readFileSync(p, 'utf8')).toBe('"new"')
        expect(readdirSync(ro)).toEqual(['config.json'])
      } finally {
        chmodSync(ro, 0o755)
      }
    }
  )

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'applies an explicit mode when falling back to an in-place write',
    () => {
      const ro = join(dir, 'ro')
      mkdirSync(ro)
      const p = join(ro, 'tokens.json')
      writeFileSync(p, '{}', { mode: 0o644 })
      chmodSync(ro, 0o555)
      try {
        writeFileAtomicSync(p, '{"t":1}', { mode: 0o600 })
        expect(statSync(p).mode & 0o777).toBe(0o600)
        expect(readFileSync(p, 'utf8')).toBe('{"t":1}')
      } finally {
        chmodSync(ro, 0o755)
      }
    }
  )

  it('still saves when another handle holds the file open', () => {
    // Windows cannot rename over an open file; the in-place fallback must
    // still land the new content (POSIX renames over it directly).
    const p = join(dir, 'a.json')
    writeFileSync(p, '"old"')
    const held = openSync(p, 'r')
    try {
      writeFileAtomicSync(p, '"new"')
    } finally {
      closeSync(held)
    }
    expect(readFileSync(p, 'utf8')).toBe('"new"')
    expect(readdirSync(dir)).toEqual(['a.json'])
  })

  it('cleans up its temp file and rethrows when the rename fails', () => {
    // A non-empty directory at the target path makes the rename fail.
    const p = join(dir, 'target')
    mkdirSync(p)
    writeFileSync(join(p, 'keep'), '')
    expect(() => writeFileAtomicSync(p, 'data')).toThrow()
    expect(readdirSync(dir)).toEqual(['target'])
  })
})
