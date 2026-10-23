// Verify that a backup zip is complete and readable.
// Usage: node scripts/verify-backup.mjs [path-to-zip]
// With no argument, the newest .zip found next to the project folder is used.
// NOTE: this file is intentionally pure ASCII so it runs the same on any code page.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateRawSync } from 'node:zlib'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '..')

function findLatestBackup() {
  const parent = resolve(projectRoot, '..')
  const dirs = [parent, projectRoot]
  try {
    for (const entry of readdirSync(parent)) {
      const full = join(parent, entry)
      try {
        if (statSync(full).isDirectory()) dirs.push(full)
      } catch {
        /* skip */
      }
    }
  } catch {
    /* skip */
  }

  const zips = []
  for (const dir of dirs) {
    if (!existsSync(dir)) continue
    let names = []
    try {
      names = readdirSync(dir)
    } catch {
      continue
    }
    for (const name of names) {
      if (!name.toLowerCase().endsWith('.zip')) continue
      const full = join(dir, name)
      try {
        zips.push({ full, mtime: statSync(full).mtimeMs })
      } catch {
        /* skip */
      }
    }
  }
  if (!zips.length) return null
  zips.sort((a, b) => b.mtime - a.mtime)
  return zips[0].full
}

const zipPath = process.argv[2] || findLatestBackup()
if (!zipPath) {
  console.error('No backup zip found next to the project folder.')
  console.error('Searched: ' + resolve(projectRoot, '..') + ' and its subfolders')
  process.exit(1)
}
if (!existsSync(zipPath)) {
  console.error('Backup file not found: ' + zipPath)
  process.exit(1)
}

const buf = readFileSync(zipPath)
console.log('File: ' + zipPath)
console.log('Size: ' + (buf.length / 1024).toFixed(1) + ' KB')

if (buf.slice(0, 2).toString('latin1') !== 'PK') {
  console.error('FAIL: not a valid zip file')
  process.exit(1)
}
console.log('ZIP magic: OK')

const eocdIndex = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
if (eocdIndex < 0) {
  console.error('FAIL: end-of-central-directory record not found, file may be corrupt')
  process.exit(1)
}
const count = buf.readUInt16LE(eocdIndex + 10)
const cdSize = buf.readUInt32LE(eocdIndex + 12)
const cdOffset = buf.readUInt32LE(eocdIndex + 16)
console.log('Central directory: ' + count + ' entries, size ' + cdSize + ' bytes')

const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(b) {
  let crc = 0xffffffff
  for (let i = 0; i < b.length; i++) crc = crcTable[(crc ^ b[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

let offset = cdOffset
let ok = 0
let failed = 0
const names = []

for (let i = 0; i < count; i++) {
  if (buf.readUInt32LE(offset) !== 0x02014b50) break
  const method = buf.readUInt16LE(offset + 10)
  const crc = buf.readUInt32LE(offset + 16)
  const compSize = buf.readUInt32LE(offset + 20)
  const nameLen = buf.readUInt16LE(offset + 28)
  const extraLen = buf.readUInt16LE(offset + 30)
  const commentLen = buf.readUInt16LE(offset + 32)
  const localOffset = buf.readUInt32LE(offset + 42)
  const name = buf.slice(offset + 46, offset + 46 + nameLen).toString('utf8')
  names.push(name)

  const lhNameLen = buf.readUInt16LE(localOffset + 26)
  const lhExtraLen = buf.readUInt16LE(localOffset + 28)
  const dataStart = localOffset + 30 + lhNameLen + lhExtraLen
  const comp = buf.slice(dataStart, dataStart + compSize)
  try {
    const data = method === 8 ? inflateRawSync(comp) : comp
    if (crc32(data) !== crc) throw new Error('CRC mismatch')
    ok++
  } catch (err) {
    failed++
    console.log('  FAIL ' + name + ' -> ' + err.message)
  }
  offset += 46 + nameLen + extraLen + commentLen
}

console.log('')
console.log('Extract check: ' + ok + ' files OK, ' + failed + ' corrupted')

const required = [
  'package.json',
  'index.html',
  'src/types.ts',
  'src/lib/numbering.ts',
  'src/data/localRepository.ts',
  'src/data/cloudRepository.ts',
  'src/store/wardrobe.tsx',
  'supabase/schema.sql',
  '.gitignore',
  'README.md'
]

console.log('')
console.log('Required files:')
let missing = 0
for (const key of required) {
  const found = names.includes(key)
  if (!found) missing++
  console.log('  ' + (found ? 'OK  ' : 'MISS') + ' ' + key)
}

console.log('')
console.log('Forbidden content:')
// 只查真正的密钥文件；.env.example 是空模板，可以安全地放进仓库
const forbidden = ['.env', 'node_modules/', 'data-export']
for (const f of forbidden) {
  const hit = names.some((n) => n === f || n.startsWith(f + '/'))
  console.log('  ' + (hit ? 'HAS ' : 'none') + ' ' + f)
}
const template = names.includes('.env.example')
console.log('  ' + (template ? 'OK  ' : 'MISS') + ' .env.example (empty template, safe to share)')

const pass = failed === 0 && missing === 0
console.log('')
console.log(pass ? 'PASS: backup is complete and usable' : 'FAIL: backup has problems')
process.exit(pass ? 0 : 1)
