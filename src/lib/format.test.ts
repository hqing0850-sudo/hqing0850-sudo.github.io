import { describe, expect, it } from 'vitest'
import { daysSince, formatDate, formatDateTime } from './format'

describe('时间格式化', () => {
  it('空值显示为破折号', () => {
    expect(formatDateTime(null)).toBe('—')
    expect(formatDate(undefined)).toBe('—')
    expect(daysSince(null)).toBeNull()
  })

  it('输出固定宽度', () => {
    const ts = new Date(2026, 0, 2, 3, 4).getTime()
    expect(formatDateTime(ts)).toBe('2026-01-02 03:04')
    expect(formatDate(ts)).toBe('2026-01-02')
  })

  it('计算距今天数', () => {
    const twoDaysAgo = Date.now() - 2 * 86_400_000
    expect(daysSince(twoDaysAgo)).toBe(2)
  })
})
