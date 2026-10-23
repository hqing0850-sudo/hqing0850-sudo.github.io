/**
 * Check that no secret or personal data can be committed to a public repository.
 *
 * Checks:
 *   1. Sensitive files present in the project (.env, backups, exported data)
 *   2. Hardcoded secrets inside source code
 *   3. .gitignore coverage
 *
 * Usage: node scripts/check-sensitive.mjs
 * NOTE: this file is intentionally pure ASCII so it runs the same on any code page.
 */
import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '..')

// File names that must never end up in a public repository.
const FORBIDDEN = [
  { label: 'real .env (may contain keys)', test: (n) => n === '.env' || n === '.env.local' },
  { label: 'backup zip', test: (n) => n.toLowerCase().endsWith('.zip') },
  { label: 'exported wardrobe data', test: (n) => n.startsWith('data-export') || n.startsWith('wardrobe-backup') },
  { label: 'service_role key file', test: (n) => /service.?role/i.test(n) }
]

// Files that are allowed even though they match a pattern (templates, no real data).
const ALLOWED = ['.env.example']

const SKIP_DIRS = new Set(['node_modules', 'dist', 'dev-dist', '.git', '.vite'])

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    let stat
    try {
      stat = statSync(full)
    } catch {
      continue
    }
    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue
      walk(full, out)
    } else {
      out.push(full)
    }
  }
  return out
}

let problems = 0

console.log('=== Sensitive file check ===')
console.log('')
console.log('Project: ' + projectRoot)
console.log('')

console.log('[1] Sensitive files present in project')
const files = walk(projectRoot)
const found = []
for (const file of files) {
  const rel = relative(projectRoot, file)
  const name = rel.split(sep).pop()
  for (const rule of FORBIDDEN) {
    if (!rule.test(rel) && !rule.test(name)) continue
    if (ALLOWED.includes(rel)) continue
    found.push({ rel, rule: rule.label })
  }
}
if (found.length === 0) {
  console.log('    OK - no sensitive files found')
} else {
  for (const item of found) {
    console.log('    PROBLEM: ' + item.rel + '  (' + item.rule + ')')
  }
  problems += found.length
}

console.log('')
console.log('[2] Hardcoded secrets in source code')
const sourceFiles = files.filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs|json|html|css)$/.test(f))

// Match real key values, not the word "service_role" used in warning text.
const secretPatterns = [
  { label: 'JWT key value (eyJ...)', re: /eyJ[A-Za-z0-9_-]{30,}/ },
  { label: 'supabase db password in url', re: /postgres(ql)?:\/\/[^:\s]+:[^@\s]+@/ },
  { label: 'assigned secret value', re: /(SERVICE_ROLE|SECRET_KEY|PRIVATE_KEY)\s*[:=]\s*['"][^'"]{12,}/i }
]

let secretHits = 0
for (const file of sourceFiles) {
  const rel = relative(projectRoot, file)
  if (rel === '.env.example') continue
  let content = ''
  try {
    content = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  const lines = content.split('\n')
  lines.forEach((line, index) => {
    for (const pattern of secretPatterns) {
      if (!pattern.re.test(line)) continue
      console.log('    PROBLEM: ' + rel + ':' + (index + 1) + '  (' + pattern.label + ')')
      console.log('      ' + line.trim().slice(0, 80))
      secretHits += 1
    }
  })
}
if (secretHits === 0) {
  console.log('    OK - no hardcoded secrets found')
} else {
  problems += secretHits
}

console.log('')
console.log('[3] .gitignore coverage')
const gitignorePath = join(projectRoot, '.gitignore')
if (!existsSync(gitignorePath)) {
  console.log('    PROBLEM: no .gitignore file')
  problems += 1
} else {
  const ignore = readFileSync(gitignorePath, 'utf8')
  const needed = ['node_modules', 'dist', '.env', '*.zip']
  for (const pattern of needed) {
    const covered = ignore.includes(pattern)
    console.log('    ' + (covered ? 'OK  ' : 'MISS') + ' covers ' + pattern)
    if (!covered) problems += 1
  }
}

console.log('')
console.log('[4] Frontend key policy')
const envExample = join(projectRoot, '.env.example')
if (existsSync(envExample)) {
  const content = readFileSync(envExample, 'utf8')
  const hasAnon = content.includes('VITE_SUPABASE_ANON_KEY')
  const hasService = /VITE_\w*SERVICE_ROLE/i.test(content)
  console.log('    ' + (hasAnon ? 'OK  ' : 'MISS') + ' has VITE_SUPABASE_ANON_KEY placeholder')
  console.log('    ' + (hasService ? 'BAD ' : 'OK  ') + ' no service_role key in frontend env')
  if (!hasAnon) problems += 1
  if (hasService) problems += 1
} else {
  console.log('    MISS no .env.example file')
  problems += 1
}

console.log('')
if (problems === 0) {
  console.log('RESULT: all checks passed - safe to commit')
} else {
  console.log('RESULT: ' + problems + ' problem(s) found - fix before committing')
}
process.exit(problems === 0 ? 0 : 1)
