import { describe, expect, it } from 'vitest'
import { createLocalRepository, findCodeMismatches } from './localRepository'
import { createMemoryStore } from './memoryStore'
import type { KeyValueStore } from './idb'
import type { NewGarmentInput } from '../types'

/** 写衣服记录时会失败一次的存储，用来验证「保存失败不会吃掉编号」 */
function createFailingStore(): KeyValueStore {
  const inner = createMemoryStore()
  let shouldFail = true
  return {
    get: <T>(collection: string, key: string) => inner.get<T>(collection, key),
    set: async <T>(collection: string, key: string, value: T) => {
      if (shouldFail && collection === 'garments') {
        shouldFail = false
        throw new Error('模拟磁盘写入失败')
      }
      await inner.set<T>(collection, key, value)
    },
    remove: (collection: string, key: string) => inner.remove(collection, key),
    list: <T>(collection: string) => inner.list<T>(collection),
    clear: (collection: string) => inner.clear(collection)
  }
}

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

describe('需求一：三个分类各自独立编号', () => {
  it('上衣、外套、裤子第一次添加都从 001 开始', async () => {
    const repo = createLocalRepository(createMemoryStore())
    expect((await repo.createGarment(input({ category: 'top' }))).code).toBe('上衣001')
    expect((await repo.createGarment(input({ category: 'outerwear' }))).code).toBe('外套001')
    expect((await repo.createGarment(input({ category: 'pants' }))).code).toBe('裤子001')
  })

  it('上衣001 → 裤子001 → 上衣002', async () => {
    const repo = createLocalRepository(createMemoryStore())
    expect((await repo.createGarment(input({ category: 'top' }))).code).toBe('上衣001')
    expect((await repo.createGarment(input({ category: 'pants' }))).code).toBe('裤子001')
    expect((await repo.createGarment(input({ category: 'top' }))).code).toBe('上衣002')
  })

  it('外套的编号不会被上衣撑大', async () => {
    const repo = createLocalRepository(createMemoryStore())
    for (let i = 0; i < 5; i += 1) {
      await repo.createGarment(input({ category: 'top' }))
    }
    expect((await repo.createGarment(input({ category: 'outerwear' }))).code).toBe('外套001')
    expect((await repo.createGarment(input({ category: 'pants' }))).code).toBe('裤子001')
  })
})

describe('需求二：删除后补回最小空缺编号', () => {
  it('删除 003 之后重新补回 003', async () => {
    const repo = createLocalRepository(createMemoryStore())
    await repo.createGarment(input({ category: 'top' }))
    await repo.createGarment(input({ category: 'top' }))
    const third = await repo.createGarment(input({ category: 'top' }))
    expect(third.code).toBe('上衣003')

    await repo.deleteGarment(third.id)
    expect((await repo.createGarment(input({ category: 'top' }))).code).toBe('上衣003')
  })

  it('删除 002 之后重新补回 002', async () => {
    const repo = createLocalRepository(createMemoryStore())
    await repo.createGarment(input({ category: 'top' }))
    const second = await repo.createGarment(input({ category: 'top' }))
    await repo.createGarment(input({ category: 'top' }))
    expect(second.code).toBe('上衣002')

    await repo.deleteGarment(second.id)
    expect((await repo.createGarment(input({ category: 'top' }))).code).toBe('上衣002')
  })

  it('删除 001 之后重新补回 001', async () => {
    const repo = createLocalRepository(createMemoryStore())
    const first = await repo.createGarment(input({ category: 'top' }))
    await repo.createGarment(input({ category: 'top' }))
    await repo.createGarment(input({ category: 'top' }))
    expect(first.code).toBe('上衣001')

    await repo.deleteGarment(first.id)
    expect((await repo.createGarment(input({ category: 'top' }))).code).toBe('上衣001')
  })

  it('外套和裤子各自也遵守同样的补位规则', async () => {
    const repo = createLocalRepository(createMemoryStore())

    const o1 = await repo.createGarment(input({ category: 'outerwear' }))
    const o2 = await repo.createGarment(input({ category: 'outerwear' }))
    const o3 = await repo.createGarment(input({ category: 'outerwear' }))
    expect([o1.code, o2.code, o3.code]).toEqual(['外套001', '外套002', '外套003'])
    await repo.deleteGarment(o3.id)
    expect((await repo.createGarment(input({ category: 'outerwear' }))).code).toBe('外套003')

    const p1 = await repo.createGarment(input({ category: 'pants' }))
    const p2 = await repo.createGarment(input({ category: 'pants' }))
    const p3 = await repo.createGarment(input({ category: 'pants' }))
    expect([p1.code, p2.code, p3.code]).toEqual(['裤子001', '裤子002', '裤子003'])
    await repo.deleteGarment(p2.id)
    expect((await repo.createGarment(input({ category: 'pants' }))).code).toBe('裤子002')
  })

  it('上衣的删除完全不影响外套和裤子', async () => {
    const repo = createLocalRepository(createMemoryStore())
    const t1 = await repo.createGarment(input({ category: 'top' }))
    await repo.createGarment(input({ category: 'top' }))
    const o1 = await repo.createGarment(input({ category: 'outerwear' }))
    const p1 = await repo.createGarment(input({ category: 'pants' }))

    await repo.deleteGarment(t1.id)

    expect((await repo.createGarment(input({ category: 'top' }))).code).toBe('上衣001')
    expect((await repo.createGarment(input({ category: 'outerwear' }))).code).toBe('外套002')
    expect((await repo.createGarment(input({ category: 'pants' }))).code).toBe('裤子002')
    expect(o1.code).toBe('外套001')
    expect(p1.code).toBe('裤子001')
  })

  it('删光某一类之后，下一件又从 001 开始', async () => {
    const repo = createLocalRepository(createMemoryStore())
    const a = await repo.createGarment(input({ category: 'top' }))
    const b = await repo.createGarment(input({ category: 'top' }))
    await repo.deleteGarment(a.id)
    await repo.deleteGarment(b.id)
    expect((await repo.createGarment(input({ category: 'top' }))).code).toBe('上衣001')
  })
})

describe('需求三：连续保存与重复提交', () => {
  it('连续保存五件，编号依次递增不跳号', async () => {
    const repo = createLocalRepository(createMemoryStore())
    const codes: string[] = []
    for (let i = 0; i < 5; i += 1) {
      codes.push((await repo.createGarment(input())).code)
    }
    expect(codes).toEqual(['上衣001', '上衣002', '上衣003', '上衣004', '上衣005'])
  })

  it('重复提交不会产生两个相同编号', async () => {
    const repo = createLocalRepository(createMemoryStore())
    const [a, b] = await Promise.all([repo.createGarment(input()), repo.createGarment(input())])
    expect(new Set([a.code, b.code]).size).toBe(2)
    const codes = (await repo.listGarments()).map((g) => g.code).sort()
    expect(codes).toEqual(['上衣001', '上衣002'])
  })

  it('保存失败不会白白吃掉一个编号', async () => {
    const repo = createLocalRepository(createFailingStore())
    await expect(repo.createGarment(input())).rejects.toThrow('模拟磁盘写入失败')
    // 失败的这次没有占用编号，下一件还是 001
    expect((await repo.createGarment(input())).code).toBe('上衣001')
  })
})

describe('需求四：换分类', () => {
  it('换到别的分类会按新分类的规则拿到编号', async () => {
    const repo = createLocalRepository(createMemoryStore())
    const top = await repo.createGarment(input({ category: 'top' }))
    expect(top.code).toBe('上衣001')

    const moved = await repo.updateGarment(top.id, { category: 'outerwear' })
    expect(moved.code).toBe('外套001')

    // 上衣序列空了，下一件上衣重新拿 001
    expect((await repo.createGarment(input({ category: 'top' }))).code).toBe('上衣001')
    // 外套被占用了 001，下一件外套拿 002
    expect((await repo.createGarment(input({ category: 'outerwear' }))).code).toBe('外套002')
  })

  it('换分类后不会出现重复编号', async () => {
    const repo = createLocalRepository(createMemoryStore())
    const top = await repo.createGarment(input({ category: 'top' }))
    await repo.updateGarment(top.id, { category: 'pants' })
    await repo.createGarment(input({ category: 'pants' }))
    await repo.createGarment(input({ category: 'top' }))

    const codes = (await repo.listGarments()).map((g) => g.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('不改分类时编号保持不变', async () => {
    const repo = createLocalRepository(createMemoryStore())
    const garment = await repo.createGarment(input())
    const updated = await repo.updateGarment(garment.id, { name: '改个名字' })
    expect(updated.code).toBe('上衣001')
  })
})

describe('需求五：刷新、重开、导入、多设备', () => {
  it('刷新页面后编号继续', async () => {
    const store = createMemoryStore()
    const first = createLocalRepository(store)
    await first.createGarment(input())
    await first.createGarment(input())

    const reopened = createLocalRepository(store)
    expect((await reopened.createGarment(input())).code).toBe('上衣003')
  })

  it('导入备份后继续编号', async () => {
    const source = createLocalRepository(createMemoryStore())
    await source.createGarment(input())
    await source.createGarment(input())
    const bundle = await source.exportBundle()

    const target = createLocalRepository(createMemoryStore())
    await target.importBundle(bundle)
    expect((await target.createGarment(input())).code).toBe('上衣003')
  })

  it('导入的编号撞号时自动另找一个空缺号', async () => {
    const source = createLocalRepository(createMemoryStore())
    await source.createGarment(input())
    const bundle = await source.exportBundle()

    const target = createLocalRepository(createMemoryStore())
    // 目标设备已经有上衣001，导入的也是上衣001
    await target.createGarment(input())
    await target.importBundle(bundle)

    const codes = (await target.listGarments()).map((g) => g.code).sort()
    expect(new Set(codes).size).toBe(codes.length)
    expect(codes).toEqual(['上衣001', '上衣002'])
  })

  it('两台设备同时添加，编号不重复', async () => {
    const store = createMemoryStore()
    const deviceA = createLocalRepository(store)
    const deviceB = createLocalRepository(store)
    const [a, b] = await Promise.all([
      deviceA.createGarment(input()),
      deviceB.createGarment(input())
    ])
    expect(new Set([a.code, b.code]).size).toBe(2)
  })
})

describe('需求六：旧数据兼容与自检', () => {
  it('旧版本存的衣服能正常读出来，照片不丢', async () => {
    const store = createMemoryStore()
    await store.set('garments', 'old-1', {
      id: 'old-1',
      code: '上衣001',
      category: 'top',
      name: '以前的衣服',
      color: '',
      seasons: [],
      thickness: 'medium',
      notes: '',
      photoPath: 'photo:old-1',
      washStatus: 'clean',
      statusChangedAt: 0,
      lastWashedAt: null,
      wearCount: 0,
      createdAt: 0,
      updatedAt: 0
    })
    await store.set('local', 'photo:old-1', 'data:image/jpeg;base64,AAAA')

    const repo = createLocalRepository(store)
    const list = await repo.listGarments()
    expect(list.length).toBe(1)
    expect(list[0].displayMode).toBe('photo')
    expect(await repo.photoUrl('photo:old-1')).toBe('data:image/jpeg;base64,AAAA')
    // 旧数据占着上衣001，下一件就是 002
    expect((await repo.createGarment(input())).code).toBe('上衣002')
  })

  it('能查出分类和编号对不上的记录（只报告不改）', async () => {
    const store = createMemoryStore()
    await store.set('garments', 'old-1', {
      id: 'old-1',
      code: '上衣003',
      category: 'pants',
      name: '老数据',
      color: '',
      seasons: [],
      thickness: 'medium',
      notes: '',
      photoPath: null,
      washStatus: 'clean',
      statusChangedAt: 0,
      lastWashedAt: null,
      wearCount: 0,
      createdAt: 0,
      updatedAt: 0
    })

    const repo = createLocalRepository(store)
    const mismatches = findCodeMismatches(await repo.listGarments())
    expect(mismatches.length).toBe(1)
    expect(mismatches[0].code).toBe('上衣003')
    expect(mismatches[0].category).toBe('pants')
    expect(mismatches[0].expectedPrefix).toBe('裤子')

    // 自检不会改动任何数据
    const after = await repo.listGarments()
    expect(after[0].code).toBe('上衣003')
  })

  it('编号前缀不匹配的旧数据不会让上衣序列撞号', async () => {
    const store = createMemoryStore()
    await store.set('garments', 'old-1', {
      id: 'old-1',
      code: '上衣003',
      category: 'pants',
      name: '老数据',
      color: '',
      seasons: [],
      thickness: 'medium',
      notes: '',
      photoPath: null,
      washStatus: 'clean',
      statusChangedAt: 0,
      lastWashedAt: null,
      wearCount: 0,
      createdAt: 0,
      updatedAt: 0
    })

    const repo = createLocalRepository(store)
    // 上衣序列跳过已被占用的 003
    expect((await repo.createGarment(input({ category: 'top' }))).code).toBe('上衣001')
    expect((await repo.createGarment(input({ category: 'top' }))).code).toBe('上衣002')
    expect((await repo.createGarment(input({ category: 'top' }))).code).toBe('上衣004')
  })
})

describe('需求七：显示的编号就是唯一编号', () => {
  it('列表里每件衣服的编号都唯一', async () => {
    const repo = createLocalRepository(createMemoryStore())
    await repo.createGarment(input({ category: 'top' }))
    await repo.createGarment(input({ category: 'outerwear' }))
    await repo.createGarment(input({ category: 'pants' }))
    await repo.createGarment(input({ category: 'top' }))

    const garments = await repo.listGarments()
    const codes = garments.map((g) => g.code)
    expect(new Set(codes).size).toBe(codes.length)
    // 名称留空时用编号，详情页标题与编号一致
    expect(garments.some((g) => g.name === g.code)).toBe(true)
  })
})

describe('照片与洗涤记录不受影响', () => {
  it('照片存取正常，不串图', async () => {
    const repo = createLocalRepository(createMemoryStore())
    const a = await repo.createGarment(input({ photo: new Blob([new Uint8Array([1, 2])]) }))
    const b = await repo.createGarment(input({ photo: new Blob([new Uint8Array([3, 4])]) }))
    expect(await repo.photoUrl(a.photoPath)).toMatch(/^data:image\/jpeg;base64,/)
    expect(await repo.photoUrl(a.photoPath)).not.toBe(await repo.photoUrl(b.photoPath))
  })

  it('洗涤记录关闭重开后仍在', async () => {
    const store = createMemoryStore()
    const repo = createLocalRepository(store)
    const garment = await repo.createGarment(input())
    await repo.setWashStatus(garment.id, 'to_wash')
    const logs = await repo.listLogs()
    expect(logs.length).toBe(1)
    expect(logs[0].itemCode).toBe(garment.code)

    const reopened = createLocalRepository(store)
    expect((await reopened.listLogs()).length).toBe(1)
  })

  it('自定义图片素材可以增删', async () => {
    const repo = createLocalRepository(createMemoryStore())
    const asset = await repo.createCustomAsset('我的卡通图', new Blob([new Uint8Array([7])]))
    expect((await repo.listCustomAssets()).length).toBe(1)
    expect(await repo.photoUrl(asset.photoPath)).toBeTruthy()
    await repo.deleteCustomAsset(asset.id)
    expect((await repo.listCustomAssets()).length).toBe(0)
  })
})
