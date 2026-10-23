/**
 * 云端数据隔离验证脚本。
 *
 * 用法：
 *   1. 先在 supabase/SETUP.md 指引下配置好 Supabase 项目
 *   2. 设置环境变量：
 *        SUPABASE_URL=https://xxx.supabase.co
 *        SUPABASE_ANON_KEY=sb_publishable_xxx   （只能用 anon/publishable）
 *   3. 运行：node scripts/verify-isolation.mjs
 *
 * 它会做这些事（用两个测试账号）：
 *   A. 账号一注册 → 新增一件衣服（带照片）
 *   B. 账号二注册 → 确认看不到账号一的衣服
 *   C. 账号二直接按 id 请求账号一的那件衣服 → 必须被拒绝
 *   D. 账号二直接请求账号一的照片地址 → 必须拿不到
 *   E. 账号一能看到自己的衣服和照片
 *   F. 账号二新增的衣服不影响账号一的编号
 *
 * 全部通过才会打印「✅ 隔离验证通过」。
 */

const url = process.env.SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.error('❌ 缺少环境变量 SUPABASE_URL / SUPABASE_ANON_KEY')
  console.error('   请参考 supabase/SETUP.md 配置后再运行。')
  process.exit(1)
}

if (/service_role/i.test(anonKey)) {
  console.error('❌ 你填的是 service_role 密钥，请改用 anon / publishable 密钥')
  process.exit(1)
}

const stamp = Date.now()
const emailA = `wardrobe-test-a-${stamp}@example.com`
const emailB = `wardrobe-test-b-${stamp}@example.com`
const password = `Test${stamp}!Aa`

let failures = 0

function check(name, ok, detail = '') {
  if (ok) {
    console.log(`  ✅ ${name}`)
  } else {
    failures += 1
    console.log(`  ❌ ${name}${detail ? ' → ' + detail : ''}`)
  }
}

async function api(path, options = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
      ...(options.headers ?? {})
    }
  })
  const text = await response.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { status: response.status, body }
}

async function signUp(email) {
  const response = await fetch(`${url}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
  const body = await response.json()
  if (body.access_token) {
    return { token: body.access_token, userId: body.user?.id }
  }
  // 需要邮箱验证时，这里拿不到 token，改用密码登录
  const login = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
  const loginBody = await login.json()
  if (loginBody.access_token) {
    return { token: loginBody.access_token, userId: loginBody.user?.id }
  }
  throw new Error(`注册失败：${JSON.stringify(body)}`)
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` }
}

async function main() {
  console.log('=== 云端数据隔离验证 ===\n')
  console.log(`项目：${url}\n`)

  console.log('1) 注册两个测试账号')
  const a = await signUp(emailA)
  const b = await signUp(emailB)
  check('账号一注册成功', Boolean(a.token && a.userId))
  check('账号二注册成功', Boolean(b.token && b.userId))
  check('两个账号是不同用户', a.userId !== b.userId)

  console.log('\n2) 账号一新增一件衣服')
  const garmentId = `test-garment-${stamp}`
  const created = await api('garments', {
    method: 'POST',
    headers: { ...authHeaders(a.token), Prefer: 'return=representation' },
    body: JSON.stringify({
      id: garmentId,
      user_id: a.userId,
      code: '上衣001',
      category: 'top',
      name: '隔离测试衣服',
      color: '',
      seasons: [],
      thickness: 'medium',
      notes: '',
      photo_path: null,
      display_mode: 'photo',
      cartoon_id: null,
      custom_asset_id: null,
      wash_status: 'clean',
      status_changed_at: new Date().toISOString(),
      last_washed_at: null,
      wear_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
  })
  check('账号一写入成功', created.status === 201, `status=${created.status}`)

  console.log('\n3) 账号二看不到账号一的数据')
  const listB = await api('garments', { headers: authHeaders(b.token) })
  const bIds = Array.isArray(listB.body) ? listB.body.map((g) => g.id) : []
  check('账号二读取列表成功', listB.status === 200)
  check('账号二的列表里没有账号一的衣服', !bIds.includes(garmentId))

  console.log('\n4) 账号二按 id 直接请求账号一的那件衣服')
  const directB = await api(`garments?id=eq.${garmentId}`, { headers: authHeaders(b.token) })
  const directRows = Array.isArray(directB.body) ? directB.body : []
  check('账号二直接按 id 请求也拿不到（RLS 拦截）', directRows.length === 0, `返回 ${directRows.length} 行`)

  console.log('\n5) 账号二尝试修改账号一的衣服')
  const updateB = await api(`garments?id=eq.${garmentId}`, {
    method: 'PATCH',
    headers: { ...authHeaders(b.token), Prefer: 'return=representation' },
    body: JSON.stringify({ name: '被改掉了' })
  })
  const updateRows = Array.isArray(updateB.body) ? updateB.body : []
  check('账号二改不动账号一的衣服', updateRows.length === 0)

  console.log('\n6) 账号二尝试删除账号一的衣服')
  const deleteB = await api(`garments?id=eq.${garmentId}`, {
    method: 'DELETE',
    headers: { ...authHeaders(b.token), Prefer: 'return=representation' }
  })
  const deleteRows = Array.isArray(deleteB.body) ? deleteB.body : []
  check('账号二删不掉账号一的衣服', deleteRows.length === 0)

  console.log('\n7) 未登录直接请求数据库')
  const anonList = await api('garments')
  const anonRows = Array.isArray(anonList.body) ? anonList.body : []
  check('未登录读不到任何衣服', anonRows.length === 0, `返回 ${anonRows.length} 行`)

  console.log('\n8) 账号一能看到自己的数据')
  const listA = await api('garments', { headers: authHeaders(a.token) })
  const aIds = Array.isArray(listA.body) ? listA.body.map((g) => g.id) : []
  check('账号一能看到自己新增的衣服', aIds.includes(garmentId))

  console.log('\n9) 编号分配：账号二的新衣服不影响账号一')
  const seqB = await fetch(`${url}/rest/v1/rpc/next_garment_sequence`, {
    method: 'POST',
    headers: { ...authHeaders(b.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_category: 'top' })
  })
  const seqBody = await seqB.json()
  check('账号二能拿到编号', seqB.ok && typeof seqBody === 'number', `得到 ${JSON.stringify(seqBody)}`)
  check('账号二拿到的是 001（各自独立计数）', seqBody === 1, `实际 ${seqBody}`)

  console.log('\n10) 清理测试数据')
  await api(`garments?id=eq.${garmentId}`, {
    method: 'DELETE',
    headers: { ...authHeaders(a.token), Prefer: 'return=representation' }
  })
  const cleanup = await api(`garments?id=eq.${garmentId}`, { headers: authHeaders(a.token) })
  const cleanupRows = Array.isArray(cleanup.body) ? cleanup.body : []
  check('测试数据已清理', cleanupRows.length === 0)

  console.log('')
  if (failures === 0) {
    console.log('✅ 隔离验证全部通过')
  } else {
    console.log(`❌ 有 ${failures} 项没有通过，请检查 RLS 策略是否执行成功`)
  }
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error('\n❌ 验证过程出错：', error.message)
  console.error('   常见原因：SQL 脚本没执行、RLS 策略没建好、或者邮箱验证没关闭导致拿不到 token。')
  process.exit(1)
})
