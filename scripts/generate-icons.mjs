// 生成 PWA 所需的 PNG 图标，不依赖任何第三方库（只用 Node 内置 zlib）。
// 用法：node scripts/generate-icons.mjs
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = resolve(here, '..', 'public')
const iconsDir = resolve(publicDir, 'icons')

const BRAND = [46, 91, 71] // #2E5B47
const INK = [246, 242, 234] // #F6F2EA

/* ---------- PNG 编码 ---------- */

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer) {
  let crc = 0xffffffff
  for (let i = 0; i < buffer.length; i += 1) {
    crc = crcTable[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeBuffer = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)
  return Buffer.concat([length, typeBuffer, data, crc])
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // 位深
  header[9] = 6 // 真彩色 + Alpha
  header[10] = 0
  header[11] = 0
  header[12] = 0

  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0 // 过滤器：None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/* ---------- 画一个 T 恤 ---------- */

const SHIRT = [
  [0.30, 0.30],
  [0.36, 0.23],
  [0.50, 0.29],
  [0.64, 0.23],
  [0.70, 0.30],
  [0.81, 0.41],
  [0.72, 0.51],
  [0.685, 0.46],
  [0.685, 0.78],
  [0.315, 0.78],
  [0.315, 0.46],
  [0.28, 0.51],
  [0.19, 0.41]
]

function insidePolygon(x, y, points) {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i]
    const [xj, yj] = points[j]
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

function roundedRect(x, y, w, h, r) {
  if (x < r && y < r) return (x - r) ** 2 + (y - r) ** 2 <= r * r
  if (x > w - r && y < r) return (x - (w - r)) ** 2 + (y - r) ** 2 <= r * r
  if (x < r && y > h - r) return (x - r) ** 2 + (y - (h - r)) ** 2 <= r * r
  if (x > w - r && y > h - r) return (x - (w - r)) ** 2 + (y - (h - r)) ** 2 <= r * r
  return true
}

/**
 * @param size 画布边长
 * @param maskable true 时铺满整块画布并把图案缩小到安全区内
 */
function drawIcon(size, maskable = false) {
  const data = Buffer.alloc(size * size * 4)
  const radius = maskable ? 0 : size * 0.22
  // maskable 图标要留出 20% 安全边距
  const scale = maskable ? 0.62 : 0.8
  const offset = (1 - scale) / 2

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const i = (py * size + px) * 4
      const x = px + 0.5
      const y = py + 0.5

      if (!maskable && !roundedRect(x, y, size, size, radius)) {
        data[i + 3] = 0
        continue
      }

      // 背景：品牌绿，中心稍亮一点点
      const glow = 1 - Math.min(1, Math.hypot(x - size / 2, y - size / 2) / size) * 0.12
      data[i] = Math.round(BRAND[0] * glow)
      data[i + 1] = Math.round(BRAND[1] * glow)
      data[i + 2] = Math.round(BRAND[2] * glow)
      data[i + 3] = 255

      const nx = (x / size - offset) / scale
      const ny = (y / size - offset) / scale
      if (nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1 && insidePolygon(nx, ny, SHIRT)) {
        data[i] = INK[0]
        data[i + 1] = INK[1]
        data[i + 2] = INK[2]
      }
    }
  }
  return data
}

function save(name, size, maskable = false) {
  const png = encodePng(size, size, drawIcon(size, maskable))
  writeFileSync(resolve(iconsDir, name), png)
  console.log(`已生成 icons/${name} (${size}x${size}, ${(png.length / 1024).toFixed(1)} KB)`)
}

function saveRoot(name, size) {
  const png = encodePng(size, size, drawIcon(size, false))
  writeFileSync(resolve(publicDir, name), png)
  console.log(`已生成 ${name} (${size}x${size}, ${(png.length / 1024).toFixed(1)} KB)`)
}

mkdirSync(iconsDir, { recursive: true })

save('icon-192.png', 192)
save('icon-512.png', 512)
save('icon-maskable-512.png', 512, true)
saveRoot('favicon.png', 64)
saveRoot('icons/apple-touch-icon.png', 180)
