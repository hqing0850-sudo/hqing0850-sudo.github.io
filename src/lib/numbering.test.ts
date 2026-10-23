import { describe, expect, it } from 'vitest'
import {
  formatCode,
  maxSequenceFromCodes,
  parseCode,
  smallestFreeSequence,
  usedSequences
} from './numbering'

describe('编号格式', () => {
  it('不足三位补零', () => {
    expect(formatCode('top', 1)).toBe('上衣001')
    expect(formatCode('outerwear', 12)).toBe('外套012')
    expect(formatCode('pants', 345)).toBe('裤子345')
  })

  it('超过三位不再补零', () => {
    expect(formatCode('top', 1234)).toBe('上衣1234')
  })
})

describe('解析编号', () => {
  it('能还原出分类和序号', () => {
    expect(parseCode('上衣007')).toEqual({ category: 'top', seq: 7 })
    expect(parseCode('外套012')).toEqual({ category: 'outerwear', seq: 12 })
    expect(parseCode('裤子001')).toEqual({ category: 'pants', seq: 1 })
  })

  it('不是编号格式时返回空', () => {
    expect(parseCode('随便起的名字')).toBeNull()
    expect(parseCode('上衣abc')).toBeNull()
    expect(parseCode('')).toBeNull()
  })
})

describe('各分类占用情况互相独立', () => {
  const codes = ['上衣001', '上衣002', '外套001', '裤子001', '裤子002']

  it('上衣只占用上衣的号', () => {
    expect([...usedSequences('top', codes)].sort((a, b) => a - b)).toEqual([1, 2])
  })

  it('外套只占用外套的号', () => {
    expect([...usedSequences('outerwear', codes)].sort((a, b) => a - b)).toEqual([1])
  })

  it('裤子只占用裤子的号', () => {
    expect([...usedSequences('pants', codes)].sort((a, b) => a - b)).toEqual([1, 2])
  })
})

describe('找最小空缺编号', () => {
  it('空序列从 001 开始', () => {
    expect(smallestFreeSequence('top', [])).toBe(1)
    expect(smallestFreeSequence('pants', [])).toBe(1)
    expect(smallestFreeSequence('outerwear', [])).toBe(1)
  })

  it('连续占用时往下找', () => {
    expect(smallestFreeSequence('top', ['上衣001', '上衣002'])).toBe(3)
  })

  it('删除 003 后补回 003', () => {
    expect(smallestFreeSequence('top', ['上衣001', '上衣002'])).toBe(3)
  })

  it('删除 002 后补回 002', () => {
    expect(smallestFreeSequence('top', ['上衣001', '上衣003'])).toBe(2)
  })

  it('删除 001 后补回 001', () => {
    expect(smallestFreeSequence('top', ['上衣002', '上衣003'])).toBe(1)
  })

  it('删除全部后从 001 重新开始', () => {
    expect(smallestFreeSequence('top', [])).toBe(1)
  })

  it('上衣有空缺不影响裤子', () => {
    const codes = ['上衣001', '上衣003', '裤子001']
    expect(smallestFreeSequence('top', codes)).toBe(2)
    expect(smallestFreeSequence('pants', codes)).toBe(2)
    expect(smallestFreeSequence('outerwear', codes)).toBe(1)
  })

  it('编号前缀属于哪个序列，就占用哪个序列的号', () => {
    // 分类是裤子、编号是上衣003 的旧数据：上衣序列跳过 3，裤子序列不受影响
    const codes = ['上衣003']
    expect(smallestFreeSequence('top', codes)).toBe(1)
    expect(smallestFreeSequence('pants', codes)).toBe(1)
  })
})

describe('最大序号（只用于排查展示）', () => {
  it('只统计当前分类', () => {
    const codes = ['上衣001', '上衣007', '外套002', '裤子100']
    expect(maxSequenceFromCodes('top', codes)).toBe(7)
    expect(maxSequenceFromCodes('outerwear', codes)).toBe(2)
    expect(maxSequenceFromCodes('pants', codes)).toBe(100)
  })

  it('忽略不符合格式的内容', () => {
    expect(maxSequenceFromCodes('top', ['上衣abc', '外套003'])).toBe(0)
  })
})
