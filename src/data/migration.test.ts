import { describe, expect, it } from 'vitest'
import { createLocalRepository } from './localRepository'
import { createMemoryStore } from './memoryStore'
import type { NewGarmentInput } from '../types'

function input(overrides: Partial<NewGarmentInput> = {}): NewGarmentInput {
  return {
    category: 'top',
    name: '',
    color: '',
    seasons: [],
    thickness: 'medium',
    notes: '',
    photo: null,
    displayMode: 'cartoon',
    cartoonId: null,
    customAssetId: null,
    ...overrides
  }
}

describe('本地数据迁移到云端', () => {
  it('导入会带上照片和洗衣记录', async () => {
    const local = createLocalRepository(createMemoryStore())
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })
    const garment = await local.createGarment(input({ photo: blob }))
    await local.setWashStatus(garment.id, 'to_wash')

    const bundle = await local.exportBundle()
    expect(bundle.garments.length).toBe(1)
    expect(bundle.logs.length).toBe(1)
    expect(bundle.photos.length).toBe(1)
    expect(bundle.photos[0].path).toBe(garment.photoPath)
  })

  it('重复导入同一个备份不会产生重复记录', async () => {
    const source = createLocalRepository(createMemoryStore())
    await source.createGarment(input())
    await source.createGarment(input())
    const bundle = await source.exportBundle()

    // 模拟云端：目标仓库
    const target = createLocalRepository(createMemoryStore())
    const first = await target.importBundle(bundle)
    expect(first.garments).toBe(2)

    // 再导入一次：同样的 id 已经存在，不应该重复插入
    const second = await target.importBundle(bundle)
    expect(second.garments).toBe(0)

    const list = await target.listGarments()
    expect(list.length).toBe(2)
    expect(new Set(list.map((g) => g.id)).size).toBe(2)
  })

  it('重复导入不会让洗衣记录翻倍', async () => {
    const source = createLocalRepository(createMemoryStore())
    const garment = await source.createGarment(input())
    await source.setWashStatus(garment.id, 'to_wash')
    const bundle = await source.exportBundle()

    const target = createLocalRepository(createMemoryStore())
    await target.importBundle(bundle)
    const second = await target.importBundle(bundle)

    expect(second.logs).toBe(0)
    expect((await target.listLogs()).length).toBe(1)
  })

  it('导入会保留照片，不会变成没有照片的空记录', async () => {
    const source = createLocalRepository(createMemoryStore())
    const blob = new Blob([new Uint8Array([9, 9])], { type: 'image/jpeg' })
    await source.createGarment(input({ photo: blob }))
    const bundle = await source.exportBundle()

    const target = createLocalRepository(createMemoryStore())
    await target.importBundle(bundle)

    const list = await target.listGarments()
    expect(list[0].photoPath).toBeTruthy()
    expect(await target.photoUrl(list[0].photoPath)).toBeTruthy()
  })

  it('导入不会删掉目标设备上已有的衣服', async () => {
    const source = createLocalRepository(createMemoryStore())
    await source.createGarment(input())
    const bundle = await source.exportBundle()

    const target = createLocalRepository(createMemoryStore())
    const mine = await target.createGarment(input({ name: '我自己的衣服' }))
    await target.importBundle(bundle)

    const list = await target.listGarments()
    expect(list.length).toBe(2)
    expect(list.some((g) => g.id === mine.id)).toBe(true)
  })

  it('导出的备份可以被原样导回去', async () => {
    const source = createLocalRepository(createMemoryStore())
    await source.createGarment(input({ category: 'top' }))
    await source.createGarment(input({ category: 'pants' }))
    const bundle = await source.exportBundle()

    const target = createLocalRepository(createMemoryStore())
    await target.importBundle(bundle)

    const before = (await source.listGarments()).map((g) => g.code).sort()
    const after = (await target.listGarments()).map((g) => g.code).sort()
    expect(after).toEqual(before)
  })
})
