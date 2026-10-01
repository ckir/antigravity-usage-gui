/**
 * Fetch the pinned Node runtime that ships as the Tauri `externalBin`
 * sidecar (`src-tauri/binaries/agu-node-<target-triple>[.exe]`). The Rust shell
 * runs the backend runner with this binary, so installed bundles need no
 * system node — a node that only exists inside fnm/nvm-initialised shells is
 * invisible to apps launched from Explorer/Finder/autostart.
 *
 * Target triple: `$TAURI_ENV_TARGET_TRIPLE` (set by the Tauri CLI for
 * before*Command hooks), else `rustc -vV`'s host. Downloads are verified
 * against the release's SHASUMS256.txt; an up-to-date binary is not
 * re-downloaded (`.version` stamp next to it).
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const NODE_VERSION = 'v24.21.0'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Target triple -> Node dist platform (`win-*` ship a bare node.exe; others a tarball). */
const PLATFORMS = {
  'x86_64-pc-windows-msvc': 'win-x64',
  'aarch64-pc-windows-msvc': 'win-arm64',
  'x86_64-apple-darwin': 'darwin-x64',
  'aarch64-apple-darwin': 'darwin-arm64',
  'x86_64-unknown-linux-gnu': 'linux-x64',
  'aarch64-unknown-linux-gnu': 'linux-arm64',
}

function targetTriple() {
  if (process.env.TAURI_ENV_TARGET_TRIPLE) return process.env.TAURI_ENV_TARGET_TRIPLE
  const out = execFileSync('rustc', ['-vV'], { encoding: 'utf8' })
  const host = /^host:\s*(\S+)/m.exec(out)?.[1]
  if (!host) throw new Error('could not determine target triple from `rustc -vV`')
  return host
}

async function download(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`)
  return Buffer.from(await res.arrayBuffer())
}

async function main() {
  const triple = targetTriple()
  const platform = PLATFORMS[triple]
  if (!platform) {
    throw new Error(`no bundled node for target ${triple} (supported: ${Object.keys(PLATFORMS).join(', ')})`)
  }
  const isWindows = platform.startsWith('win-')
  const binDir = join(root, 'src-tauri', 'binaries')
  // Not plain `node`: Linux .deb bundles install externalBin into /usr/bin,
  // where that name would collide with the distro's nodejs package.
  const dest = join(binDir, `agu-node-${triple}${isWindows ? '.exe' : ''}`)
  const stamp = `${dest}.version`

  if (existsSync(dest) && existsSync(stamp) && readFileSync(stamp, 'utf8').trim() === NODE_VERSION) {
    console.log(`fetch-node: ${dest} is ${NODE_VERSION}, up to date`)
    return
  }

  const base = `https://nodejs.org/dist/${NODE_VERSION}`
  const asset = isWindows ? `${platform}/node.exe` : `node-${NODE_VERSION}-${platform}.tar.gz`
  console.log(`fetch-node: downloading ${base}/${asset}`)

  const sums = (await download(`${base}/SHASUMS256.txt`)).toString('utf8')
  const expected = sums
    .split('\n')
    .map((l) => l.trim().split(/\s+/))
    .find(([, name]) => name === asset)?.[0]
  if (!expected) throw new Error(`${asset} not listed in ${base}/SHASUMS256.txt`)

  const body = await download(`${base}/${asset}`)
  const actual = createHash('sha256').update(body).digest('hex')
  if (actual !== expected) throw new Error(`sha256 mismatch for ${asset}: expected ${expected}, got ${actual}`)

  mkdirSync(binDir, { recursive: true })
  if (isWindows) {
    writeFileSync(dest, body)
  } else {
    const tmp = mkdtempSync(join(tmpdir(), 'fetch-node-'))
    try {
      const tarball = join(tmp, 'node.tar.gz')
      writeFileSync(tarball, body)
      const member = `node-${NODE_VERSION}-${platform}/bin/node`
      execFileSync('tar', ['-xzf', tarball, '-C', tmp, member])
      copyFileSync(join(tmp, member), dest) // copy, not rename: tmpdir may be another device
      chmodSync(dest, 0o755)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  }
  writeFileSync(stamp, `${NODE_VERSION}\n`)
  console.log(`fetch-node: wrote ${dest}`)
}

main().catch((err) => {
  console.error(`fetch-node: ${err instanceof Error ? err.message : err}`)
  process.exit(1)
})
