import type { Category } from '../types'

const CATEGORY_PREFIX: Record<Category, string> = {
  top: '上衣',
  outerwear: '外套',
  pants: '裤子'
}

export const CATEGORIES_ORDER: Category[] = ['top', 'outerwear', 'pants']

/** 把计数转成至少三位的编号，如 1 -> 001，1234 -> 1234 */
export function formatCode(category: Category, seq: number): string {
  return `${CATEGORY_PREFIX[category]}${String(seq).padStart(3, '0')}`
}

/**
 * 解析编号：得到「属于哪个编号序列」和「序号是多少」。
 *
 * 序列以编号前缀为准，而不是以衣服的分类字段为准。
 * 这样即使某条旧数据的分类和编号对不上（比如分类是裤子、编号是上衣003），
 * 上衣序列也会正确地认为 3 号已被占用，不会再发出去造成重复。
 */
export function parseCode(code: string): { category: Category; seq: number } | null {
  for (const category of CATEGORIES_ORDER) {
    const prefix = CATEGORY_PREFIX[category]
    if (!code.startsWith(prefix)) continue
    const digits = code.slice(prefix.length)
    if (!/^\d+$/.test(digits)) continue
    const seq = Number.parseInt(digits, 10)
    if (Number.isFinite(seq) && seq > 0) return { category, seq }
  }
  return null
}

/**
 * 某个编号序列里，当前已经被占用的序号集合。
 *
 * 只统计「前缀属于该分类」的编号，所以三个分类天生互不影响：
 * 上衣占用 1、2，裤子占用 1、2，两边各算各的。
 */
export function usedSequences(category: Category, codes: string[]): Set<number> {
  const used = new Set<number>()
  for (const code of codes) {
    const parsed = parseCode(code)
    if (!parsed || parsed.category !== category) continue
    used.add(parsed.seq)
  }
  return used
}

/**
 * 找出该分类当前「未被使用的最小正整数编号」。
 *
 * 规则：从 001 开始往上找，遇到第一个没被占用的就返回。
 * 所以删掉 003 之后，下一件上衣重新拿到 003；删掉 001 之后拿到 001。
 *
 * 之所以不维护「计数器」，是因为计数器一旦和实际衣服列表不同步
 * （保存失败、连点两次、旧数据、导入备份）就会跳号。
 * 直接从「当前实际占用的编号集合」算，天然不会不同步。
 */
export function smallestFreeSequence(category: Category, codes: string[]): number {
  const used = usedSequences(category, codes)
  let seq = 1
  while (used.has(seq)) seq += 1
  return seq
}

/** 从已有编号中解析出最大序号（只用于排查和展示，不参与分配） */
export function maxSequenceFromCodes(category: Category, codes: string[]): number {
  const used = usedSequences(category, codes)
  let max = 0
  for (const seq of used) {
    if (seq > max) max = seq
  }
  return max
}

export function categoryPrefix(category: Category): string {
  return CATEGORY_PREFIX[category]
}
