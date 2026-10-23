// Remove every non-ASCII character from the given files.
// Windows CMD reads .bat files using the console code page (GBK on Chinese Windows),
// so a UTF-8 .bat file can break. Keeping these files pure ASCII avoids the problem.
// Usage: node scripts/strip-ascii.mjs scripts/verify-backup.mjs scripts/check-sensitive.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const files = process.argv.slice(2)
if (!files.length) {
  console.error('Usage: node scripts/strip-ascii.mjs <file...>')
  process.exit(1)
}

for (const file of files) {
  const original = readFileSync(file, 'utf8')
  const cleaned = original.replace(/[^\x20-\x7E\t\r\n]/g, '')
  if (cleaned === original) {
    console.log('unchanged: ' + file)
    continue
  }
  writeFileSync(file, cleaned, 'utf8')
  const removed = original.length - cleaned.length
  console.log('cleaned:   ' + file + '  (' + removed + ' non-ASCII chars removed)')
}
