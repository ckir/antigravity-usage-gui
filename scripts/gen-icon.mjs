/**
 * Generate a placeholder app icon PNG (1024x1024) with pure Node (no binary
 * downloads): dark rounded square + three quota bars (green/amber/red).
 * `npx tauri icon` then derives .ico/.icns/.png sizes from it.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SIZE = 1024
const pixels = Buffer.alloc(SIZE * SIZE * 4)

function px(x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return
  const i = (y * SIZE + x) * 4
  pixels[i] = r
  pixels[i + 1] = g
  pixels[i + 2] = b
  pixels[i + 3] = a
}

function rect(x0, y0, x1, y1, r, g, b) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) px(x, y, r, g, b)
}

// Background: dark slate with rounded corners.
const R = 200
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const cx = Math.min(x, SIZE - 1 - x)
    const cy = Math.min(y, SIZE - 1 - y)
    const corner = cx < R && cy < R && (R - cx) ** 2 + (R - cy) ** 2 > R * R
    if (!corner) px(x, y, 30, 41, 59)
  }
}

// Three quota bars: green 78%, amber 45%, red 12%.
const bars = [
  { x: 172, h: 560, c: [34, 197, 94] },
  { x: 412, h: 340, c: [245, 158, 11] },
  { x: 652, h: 140, c: [239, 68, 68] },
]
for (const { x, h, c } of bars) {
  rect(x, 820 - h, x + 200, 820, c[0], c[1], c[2])
  // Track behind the bar.
  rect(x, 180, x + 200, 820 - h, 51, 65, 85)
}

function crc32(buf) {
  let table = crc32.table
  if (!table) {
    table = crc32.table = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c
    }
  }
  let crc = -1
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // RGBA
const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE)
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0 // filter byte
  pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4)
}
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
])

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
mkdirSync(join(root, 'src-tauri', 'icons-src'), { recursive: true })
const out = join(root, 'src-tauri', 'icons-src', 'app-icon.png')
writeFileSync(out, png)
console.log(`wrote ${out} (${png.length} bytes)`)
