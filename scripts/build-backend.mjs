/**
 * Bundle the Node sidecar (`src-tauri/backend/runner.ts` + vendored
 * `src-core/`) into a single CommonJS file the Tauri shell can spawn:
 * `dist-backend/runner.cjs`. Platform: node, so all `node:*` builtins stay
 * external. No npm dependencies are bundled beyond what esbuild resolves
 * from node_modules (src-core is dependency-free).
 */
import { buildSync } from 'esbuild'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

mkdirSync(join(root, 'dist-backend'), { recursive: true })

buildSync({
  entryPoints: [join(root, 'src-tauri/backend/runner.ts')],
  outfile: join(root, 'dist-backend/runner.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  logLevel: 'info',
})
