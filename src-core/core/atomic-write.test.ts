import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
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
