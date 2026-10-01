import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// writeSync fails with EPERM, as on a dropped network share or under a
// byte-range lock. Everything else in node:fs stays real.
vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>()
  return {
    ...fs,
    writeSync: () => {
      throw Object.assign(new Error('EPERM: operation not permitted, write'), { code: 'EPERM' })
    },
  }
})

const { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } = await import('node:fs')
const { tmpdir } = await import('node:os')
const { join } = await import('node:path')
const { writeFileAtomicSync } = await import('./atomic-write')

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atomic-write-fault-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('writeFileAtomicSync when writing the temp file fails', () => {
  it('throws and leaves the original intact instead of truncating it in place', () => {
    const p = join(dir, 'tokens.json')
    writeFileSync(p, '{"refresh":"keep-me"}')
    expect(() => writeFileAtomicSync(p, '{"refresh":"new"}', { mode: 0o600 })).toThrow(/EPERM/)
    expect(readFileSync(p, 'utf8')).toBe('{"refresh":"keep-me"}')
    expect(readdirSync(dir)).toEqual(['tokens.json'])
  })
})
