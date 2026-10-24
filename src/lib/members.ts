const KEY = 'wardrobe.members'

/** 默认成员，用户可以直接用，也可以自定义新名字 */
export const DEFAULT_MEMBERS = ['爸爸', '妈妈', '我']

function unique(list: string[]): string[] {
  const out: string[] = []
  for (const item of list) {
    const name = item.trim()
    if (name && !out.includes(name)) out.push(name)
  }
  return out
}

/** 读取本机记住的成员名单（会合并默认成员） */
export function loadMembers(): string[] {
  let saved: string[] = []
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        saved = parsed.filter((item): item is string => typeof item === 'string')
      }
    }
  } catch {
    // 读不到就用默认名单
  }
  return unique([...DEFAULT_MEMBERS, ...saved])
}

/** 新用过的自定义名字记到本机，下次可以直接点 */
export function rememberMember(name: string): void {
  const trimmed = name.trim()
  if (!trimmed) return
  try {
    localStorage.setItem(KEY, JSON.stringify(unique([...loadMembers(), trimmed])))
  } catch {
    // 记不住也不影响这件衣服保存
  }
}

/** 成员列表 = 本机名单 + 现有衣服里出现过的名字 */
export function allMembers(garments: { member?: string }[]): string[] {
  return unique([...loadMembers(), ...garments.map((g) => g.member ?? '')])
}
