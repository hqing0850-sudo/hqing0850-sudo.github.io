/**
 * Second safety gate: inspect the ACTUAL list of files git is about to commit.
 *
 * This runs after "git add -A", so it sees exactly what would be uploaded.
 * It aborts the whole flow if anything unsafe is staged.
 *
 * Usage: node scripts/check-staged.mjs
 * NOTE: pure ASCII on purpose.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '..')

function git(args) {
  try {
    return execFileSync('git', args, { cwd: projectRoot, encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

// Patterns that must never be committed.
const FORBIDDEN_PATTERNS = [
  { label: 'real .env file', re: /^\.env$/ },
  { label: 'env file with values', re: /^\.env\.(local|production|development)$/ },
  { label: 'backup archive', re: /\.(zip|msi|7z|rar|tar|gz)$/i },
  { label: 'exported wardrobe data', re: /^(data-export|wardrobe-backup)/i },
  { label: 'build output', re: /^(dist|dev-dist)\// },
  { label: 'dependencies', re: /^node_modules\// },
  { label: 'log file', re: /\.log$/i },
  { label: 'private key', re: /(^|\/)(id_rsa|id_ed25519|\.pem|\.key)$/i }
]

// These are fine and expected in the repo.
const ALLOWED_PATTERNS = [/^\.env\.example$/]

let problems = 0

console.log('=== Staged file gate ===')
console.log('')

const gitDir = join(projectRoot, '.git')
if (!existsSync(gitDir)) {
  console.log('No git repository yet - nothing staged. OK')
  process.exit(0)
}

const staged = git(['diff', '--cached', '--name-only'])
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean)

if (staged.length === 0) {
  console.log('Nothing staged yet. OK')
  process.exit(0)
}

console.log('Staged files (' + staged.length + '):')
for (const file of staged) console.log('  ' + file)
console.log('')

console.log('Safety scan:')
for (const file of staged) {
  const normalized = file.replace(/\\/g, '/')
  if (ALLOWED_PATTERNS.some((p) => p.test(normalized))) {
    console.log('  OK   ' + normalized + '  (allowed)')
    continue
  }
  const hit = FORBIDDEN_PATTERNS.find((p) => p.re.test(normalized))
  if (hit) {
    console.log('  BAD  ' + normalized + '  -> ' + hit.label)
    problems += 1
  }
}

console.log('')

// Big files can slow git and may contain personal data.
console.log('Large files (> 5 MB):')
let large = 0
for (const file of staged) {
  const full = join(projectRoot, file)
  try {
    if (!statSync(full).isFile()) continue
    const size = statSync(full).size
    if (size > 5 * 1024 * 1024) {
      console.log('  BAD  ' + file + '  ' + (size / 1024 / 1024).toFixed(1) + ' MB')
      large += 1
    }
  } catch {
    /* skip */
  }
}
if (large === 0) console.log('  OK   none')
problems += large

// Scan the actual content of staged text files for key-like strings.
console.log('')
console.log('Secret scan in staged content:')
const SECRET_RES = [
  { label: 'JWT key', re: /eyJ[A-Za-z0-9_-]{40,}/ },
  { label: 'supabase password in url', re: /postgres(ql)?:\/\/[^:\s]+:[^@\s]{4,}@/ },
  { label: 'service_role assignment', re: /SERVICE_ROLE_KEY\s*[:=]\s*['"][A-Za-z0-9._-]{20,}/ }
]
let secrets = 0
for (const file of staged) {
  const full = join(projectRoot, file)
  let content = ''
  try {
    if (statSync(full).size > 2 * 1024 * 1024) continue
    content = git(['show', ':' + file])
  } catch {
    continue
  }
  if (!content) continue
  for (const rule of SECRET_RES) {
    const match = content.match(rule.re)
    if (!match) continue
    console.log('  BAD  ' + file + '  -> ' + rule.label)
    secrets += 1
  }
}
if (secrets === 0) console.log('  OK   no key-like strings found')
problems += secrets

console.log('')
if (problems === 0) {
  console.log('PASS: staged content is safe to commit')
} else {
  console.log('FAIL: ' + problems + ' problem(s) - run "git reset" and fix before pushing')
}
process.exit(problems === 0 ? 0 : 1)
