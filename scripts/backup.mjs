// 打包整个项目做备份（不依赖外部工具，Windows 也能跑）
// 用法：node scripts/backup.mjs
import { createWriteStream, existsSync, readdirSync, readFileSync, statSync, mkdirSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateRawSync, crc32 as zlibCrc32 } from 'node:zlib'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '..')
const backupDir = resolve(projectRoot, '..', '备份')

// 不需要备份的目录
const SKIP_DIRS = new Set(['node_modules', 'dev-dist', 'dist', '.git', '.vite'])
const SKIP_FILES = new Set(['test-output.txt', 'build-output.txt', 'run-done.txt'])

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue
      walk(full, out)
    } else {
      if (SKIP_FILES.has(entry)) continue
      out.push(full)
    }
  }
  return out
}

/* ---------- 最小 ZIP 写入器 ---------- */

function crc32(buf) {
  return zlibCrc32(buf) >>> 0
}

function dosDateTime(date) {
  const time =
    (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const day =
    ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { time, day }
}

const chunks = []
const central = []
let offset = 0

function addFile(name, data, date) {
  const nameBuf = Buffer.from(name, 'utf8')
  const compressed = deflateRawSync(data, { level: 9 })
  const { time, day } = dosDateTime(date)
  const crc = crc32(data)

  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4) // version needed
  local.writeUInt16LE(0x0800, 6) // UTF-8 名称
  local.writeUInt16LE(8, 8) // deflate
  local.writeUInt16LE(time, 10)
  local.writeUInt16LE(day, 12)
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(compressed.length, 18)
  local.writeUInt32LE(data.length, 22)
  local.writeUInt16LE(nameBuf.length, 26)
  local.writeUInt16LE(0, 28)

  chunks.push(local, nameBuf, compressed)

  const header = Buffer.alloc(46)
  header.writeUInt32LE(0x02014b50, 0)
  header.writeUInt16LE(20, 4)
  header.writeUInt16LE(20, 6)
  header.writeUInt16LE(0x0800, 8)
  header.writeUInt16LE(8, 10)
  header.writeUInt16LE(time, 12)
  header.writeUInt16LE(day, 14)
  header.writeUInt32LE(crc, 16)
  header.writeUInt32LE(compressed.length, 20)
  header.writeUInt32LE(data.length, 24)
  header.writeUInt16LE(nameBuf.length, 28)
  header.writeUInt32LE(0, 38) // 外部属性
  header.writeUInt32LE(offset, 42)

  central.push(header, nameBuf)
  offset += local.length + nameBuf.length + compressed.length
}

const stamp = new Date().toISOString().slice(0, 10)
const zipName = `my-ai-wardrobe-备份-${stamp}.zip`
const zipPath = resolve(backupDir, zipName)

mkdirSync(backupDir, { recursive: true })

const files = walk(projectRoot)
let totalBytes = 0

for (const file of files) {
  const rel = relative(projectRoot, file).split(sep).join('/')
  const data = readFileSync(file)
  addFile(rel, data, statSync(file).mtime)
  totalBytes += data.length
}

const centralBuf = Buffer.concat(central)
const end = Buffer.alloc(22)
end.writeUInt32LE(0x06054b50, 0)
end.writeUInt16LE(files.length, 8)
end.writeUInt16LE(files.length, 10)
end.writeUInt32LE(centralBuf.length, 12)
end.writeUInt32LE(offset, 16)

const out = createWriteStream(zipPath)
out.write(Buffer.concat([...chunks, centralBuf, end]))
out.end()

out.on('close', () => {
  const size = statSync(zipPath).size
  console.log(`✅ 备份完成`)
  console.log(`   路径：${zipPath}`)
  console.log(`   文件数：${files.length}`)
  console.log(`   原始大小：${(totalBytes / 1024).toFixed(1)} KB`)
  console.log(`   压缩包大小：${(size / 1024).toFixed(1)} KB`)
  if (!existsSync(zipPath)) process.exit(1)
})
