import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Injectable node:fs faults; everything not faulted stays real.
const faults = { writeSync: false, createTmp: false, chmod: false }
const eperm = (op: string) => Object.assign(new Error(`EPERM: operation not permitted, ${op}`), { code: 'EPERM' })
const eacces = (op: string) => Object.assign(new Error(`EACCES: permission denied, ${op}`), { code: 'EACCES' })

vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>()
  return {
    ...fs,
    // A dropped network share or a byte-range lock mid-write.
    writeSync: (...args: Parameters<typeof fs.writeSync>) => {
      if (faults.writeSync) throw eperm('write')
      return fs.writeSync(...args)
    },
    // A read-only directory: the temp file next to the target can't be created.
    openSync: (...args: Parameters<typeof fs.openSync>) => {
      if (faults.createTmp && String(args[0]).endsWith('.tmp')) throw eacces('open')
      return fs.openSync(...args)
    },
    // A writable file the process does not own.
    chmodSync: (...args: Parameters<typeof fs.chmodSync>) => {
      if (faults.chmod) throw eperm('chmod')
      return fs.chmodSync(...args)
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
  Object.assign(faults, { writeSync: false, createTmp: false, chmod: false })
  rmSync(dir, { recursive: true, force: true })
})

describe('writeFileAtomicSync under injected faults', () => {
  it('throws and leaves the original intact when writing the temp file fails', () => {
    faults.writeSync = true
    const p = join(dir, 'tokens.json')
    writeFileSync(p, '{"refresh":"keep-me"}')
    expect(() => writeFileAtomicSync(p, '{"refresh":"new"}', { mode: 0o600 })).toThrow(/EPERM/)
    expect(readFileSync(p, 'utf8')).toBe('{"refresh":"keep-me"}')
    expect(readdirSync(dir)).toEqual(['tokens.json'])
  })

  it('saves in place when the temp file cannot be created, even if chmod is refused', () => {
    faults.createTmp = true
    faults.chmod = true
    const p = join(dir, 'tokens.json')
    writeFileSync(p, '{}')
    expect(() => writeFileAtomicSync(p, '{"t":1}', { mode: 0o600 })).not.toThrow()
    expect(readFileSync(p, 'utf8')).toBe('{"t":1}')
    expect(readdirSync(dir)).toEqual(['tokens.json'])
  })
})
