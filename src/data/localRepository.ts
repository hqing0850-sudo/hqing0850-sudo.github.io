import { categoryPrefix, formatCode, parseCode, smallestFreeSequence } from '../lib/numbering'
import { blobToDataUrl, dataUrlToBlob, newId } from '../lib/image'
import type {
  CustomAsset,
  ExportBundle,
  Garment,
  GarmentPatch,
  Member,
  NewGarmentInput,
  NewOutfitInput,
  Outfit,
  OutfitPatch,
  WashLog,
  WashStatus
} from '../types'
import { idbStore, type KeyValueStore } from './idb'
import { buildLog, type WardrobeRepository } from './repository'
import { outfitGarmentIds } from '../lib/outfits'

const COLLECTION = 'local'
const GARMENTS = 'garments'
const LOGS = 'logs'
const ASSETS = 'customAssets'
const OUTFITS = 'outfits'
const MEMBERS = 'members'
const MEMBERS_SEEDED = 'membersSeeded'
/** 图片的存放键：真实照片是 photo:<衣服id>，自定义素材是 custom:<素材id> */
const PHOTO_PREFIX = 'photo:'
const CUSTOM_PREFIX = 'custom:'

/**
 * 编号分配必须串行执行，否则连点两次「保存」可能拿到同一个号。
 * 这个锁对本机所有仓库实例共享。
 */
let allocationLock: Promise<unknown> = Promise.resolve()

function withAllocationLock<T>(task: () => Promise<T>): Promise<T> {
  const result = allocationLock.then(task, task)
  allocationLock = result.then(
    () => undefined,
    () => undefined
  )
  return result
}

/**
 * 老版本存的数据没有 displayMode / cartoonId / customAssetId，
 * 读出来时补上默认值，避免老记录打不开。
 */
function normalizeGarment(garment: Garment): Garment {
  return {
    ...garment,
    member: garment.member ?? '',
    memberId: garment.memberId ?? null,
    displayMode: garment.displayMode ?? 'photo',
    cartoonId: garment.cartoonId ?? null,
    customAssetId: garment.customAssetId ?? null
  }
}

async function readOutfits(store: KeyValueStore): Promise<Outfit[]> {
  const rows = await store.list<Outfit>(OUTFITS)
  return rows.map((row) => row.value).sort((a, b) => b.createdAt - a.createdAt)
}

async function readMembers(store: KeyValueStore): Promise<Member[]> {
  const rows = await store.list<Member>(MEMBERS)
  return rows
    .map((row) => row.value)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
}

function dedupeMembers(list: Member[]): Member[] {
  const seen = new Set<string>()
  const out: Member[] = []
  for (const member of list) {
    if (seen.has(member.name)) continue
    seen.add(member.name)
    out.push(member)
  }
  return out
}

/** 默认衣柜只种一次；并发调用也要串行，避免种出两份 */
let membersLock: Promise<unknown> = Promise.resolve()

function withMembersLock<T>(task: () => Promise<T>): Promise<T> {
  const result = membersLock.then(task, task)
  membersLock = result.then(
    () => undefined,
    () => undefined
  )
  return result
}

/** 第一次使用本机模式时补上默认衣柜；之后删光了也不会自动补 */
async function ensureMembers(store: KeyValueStore): Promise<Member[]> {
  return withMembersLock(async () => {
    const members = dedupeMembers(await readMembers(store))
    const seeded = await store.get<boolean>(COLLECTION, MEMBERS_SEEDED)
    if (seeded) return members

    const garments = await readGarments(store)
    const names = ['爸爸', '妈妈', '我', ...garments.map((g) => g.member ?? '')]
    const seen = new Set(members.map((m) => m.name))
    let order = members.length
    for (const raw of names) {
      const name = raw.trim()
      if (!name || seen.has(name)) continue
      seen.add(name)
      order += 1
      const member: Member = { id: newId(), name, sortOrder: order }
      await store.set(MEMBERS, member.id, member)
    }
    await store.set(COLLECTION, MEMBERS_SEEDED, true)
    return dedupeMembers(await readMembers(store))
  })
}

async function resolveMember(
  store: KeyValueStore,
  memberId: string | null | undefined,
  memberName: string | undefined
): Promise<{ id: string | null; name: string }> {
  const members = await ensureMembers(store)
  if (memberId) {
    const found = members.find((m) => m.id === memberId)
    if (found) return { id: found.id, name: found.name }
  }
  const name = (memberName ?? '').trim()
  if (!name) return { id: null, name: '' }
  const byName = members.find((m) => m.name === name)
  if (byName) return { id: byName.id, name: byName.name }
  const created: Member = { id: newId(), name, sortOrder: members.length + 1 }
  await store.set(MEMBERS, created.id, created)
  return { id: created.id, name: created.name }
}

async function readGarments(store: KeyValueStore): Promise<Garment[]> {
  const rows = await store.list<Garment>(GARMENTS)
  return rows
    .map((row) => normalizeGarment(row.value))
    .sort((a, b) => b.createdAt - a.createdAt)
}

async function readLogs(store: KeyValueStore): Promise<WashLog[]> {
  const rows = await store.list<WashLog>(LOGS)
  return rows.map((row) => row.value).sort((a, b) => b.at - a.at)
}

async function putGarment(store: KeyValueStore, garment: Garment): Promise<void> {
  await store.set(GARMENTS, garment.id, garment)
}

/** 存图片，返回图片路径（同时也是它在存储里的键） */
async function storeImage(store: KeyValueStore, path: string, blob: Blob): Promise<string> {
  const dataUrl = await blobToDataUrl(blob)
  await store.set(COLLECTION, path, dataUrl)
  return path
}

export function createLocalRepository(store: KeyValueStore = idbStore): WardrobeRepository {
  async function readAssets(): Promise<CustomAsset[]> {
    const rows = await store.list<CustomAsset>(ASSETS)
    return rows.map((row) => row.value).sort((a, b) => b.createdAt - a.createdAt)
  }

  return {
    kind: 'local',

    async listGarments() {
      return readGarments(store)
    },

    async createGarment(input: NewGarmentInput) {
      // 算号和保存放在同一把锁里，避免连点两次拿到同一个号
      return withAllocationLock(async () => {
        const garments = await readGarments(store)
        const codes = garments.map((g) => g.code)
        const code = formatFrom(input.category, codes)

        const now = Date.now()
        const id = newId()
        const photoPath = input.photo
          ? await storeImage(store, `${PHOTO_PREFIX}${id}`, input.photo)
          : null
        const member = await resolveMember(store, input.memberId, input.member)
        const garment: Garment = {
          id,
          code,
          category: input.category,
          member: member.name,
          memberId: member.id,
          name: input.name.trim() || code,
          color: input.color.trim(),
          seasons: input.seasons,
          thickness: input.thickness,
          notes: input.notes.trim(),
          photoPath,
          displayMode: input.displayMode,
          cartoonId: input.cartoonId,
          customAssetId: input.customAssetId,
          washStatus: 'clean',
          statusChangedAt: now,
          lastWashedAt: null,
          wearCount: 0,
          createdAt: now,
          updatedAt: now
        }
        await putGarment(store, garment)
        return garment
      })
    },

    async updateGarment(id: string, patch: GarmentPatch, photo?: Blob | null) {
      return withAllocationLock(async () => {
        const currentRow = await store.get<Garment>(GARMENTS, id)
        const current = currentRow ? normalizeGarment(currentRow) : null
        if (!current) throw new Error('衣服不存在或已被删除')

        let photoPath = current.photoPath
        if (photo !== undefined) {
          if (photo) {
            photoPath = await storeImage(store, `${PHOTO_PREFIX}${id}`, photo)
          } else if (photoPath) {
            await store.remove(COLLECTION, photoPath)
            photoPath = null
          }
        }

        // 换了分类就在新分类里找最小空缺编号（排除自己，否则会算到自己原来的号）
        let code = current.code
        if (patch.category && patch.category !== current.category) {
          const garments = await readGarments(store)
          code = formatFrom(
            patch.category,
            garments.filter((g) => g.id !== id).map((g) => g.code)
          )
        }

        let member = { id: current.memberId, name: current.member }
        if (patch.memberId !== undefined || patch.member !== undefined) {
          member = await resolveMember(
            store,
            patch.memberId !== undefined ? patch.memberId : null,
            patch.member !== undefined ? patch.member : current.member
          )
        }

        const next: Garment = {
          ...current,
          ...patch,
          member: member.name,
          memberId: member.id,
          code,
          photoPath,
          updatedAt: Date.now(),
          statusChangedAt:
            patch.washStatus && patch.washStatus !== current.washStatus
              ? Date.now()
              : current.statusChangedAt
        }
        await putGarment(store, next)
        return next
      })
    },

    async deleteGarment(id: string) {
      const outfits = await readOutfits(store)
      if (outfits.some((outfit) => outfitGarmentIds(outfit).includes(id))) {
        throw new Error('这件衣服正在被搭配使用，请先去「搭配」里删除相关搭配')
      }
      const current = await store.get<Garment>(GARMENTS, id)
      if (current?.photoPath) {
        await store.remove(COLLECTION, current.photoPath)
      }
      // 删掉记录后，这个编号就空出来了，下一件同类衣服会补回这个最小空缺
      await store.remove(GARMENTS, id)
    },

    async setWashStatus(id: string, status: WashStatus) {
      const currentRow = await store.get<Garment>(GARMENTS, id)
      const current = currentRow ? normalizeGarment(currentRow) : null
      if (!current) throw new Error('衣服不存在或已被删除')
      if (current.washStatus === status) return current
      const now = Date.now()
      const next: Garment = {
        ...current,
        washStatus: status,
        statusChangedAt: now,
        lastWashedAt: status === 'clean' ? now : current.lastWashedAt,
        updatedAt: now
      }
      await putGarment(store, next)
      await store.set(LOGS, newId(), buildLog(next, current.washStatus, status))
      return next
    },

    async listLogs() {
      return readLogs(store)
    },

    async clearLogs() {
      await store.clear(LOGS)
    },

    async photoUrl(path: string | null) {
      if (!path) return null
      // path 就是存放时的键（如 photo:xxx / custom:xxx），必须原样读取
      return store.get<string>(COLLECTION, path)
    },

    async listCustomAssets() {
      return readAssets()
    },

    async createCustomAsset(name: string, blob: Blob) {
      const id = newId()
      const photoPath = await storeImage(store, `${CUSTOM_PREFIX}${id}`, blob)
      const asset: CustomAsset = {
        id,
        name: name.trim() || '自定义图片',
        photoPath,
        createdAt: Date.now()
      }
      await store.set(ASSETS, id, asset)
      return asset
    },

    async deleteCustomAsset(id: string) {
      const asset = await store.get<CustomAsset>(ASSETS, id)
      if (asset?.photoPath) await store.remove(COLLECTION, asset.photoPath)
      await store.remove(ASSETS, id)
    },

    async listOutfits() {
      return readOutfits(store)
    },

    async createOutfit(input: NewOutfitInput) {
      const now = Date.now()
      const outfit: Outfit = {
        id: newId(),
        name: input.name.trim(),
        notes: input.notes.trim(),
        topId: input.topId,
        outerwearId: input.outerwearId,
        pantsId: input.pantsId,
        shoesId: input.shoesId,
        createdAt: now,
        updatedAt: now
      }
      await store.set(OUTFITS, outfit.id, outfit)
      return outfit
    },

    async updateOutfit(id: string, patch: OutfitPatch) {
      const current = await store.get<Outfit>(OUTFITS, id)
      if (!current) throw new Error('搭配不存在')
      const next: Outfit = {
        ...current,
        ...patch,
        name: patch.name !== undefined ? patch.name.trim() : current.name,
        notes: patch.notes !== undefined ? patch.notes.trim() : current.notes,
        updatedAt: Date.now()
      }
      await store.set(OUTFITS, id, next)
      return next
    },

    async deleteOutfit(id: string) {
      await store.remove(OUTFITS, id)
    },

    async listMembers() {
      return ensureMembers(store)
    },

    async createMember(name: string) {
      const trimmed = name.trim()
      if (!trimmed) throw new Error('名字不能为空')
      const members = await ensureMembers(store)
      const existing = members.find((m) => m.name === trimmed)
      if (existing) return existing
      const member: Member = { id: newId(), name: trimmed, sortOrder: members.length + 1 }
      await store.set(MEMBERS, member.id, member)
      return member
    },

    async renameMember(id: string, name: string) {
      const trimmed = name.trim()
      if (!trimmed) throw new Error('名字不能为空')
      const members = await ensureMembers(store)
      const target = members.find((m) => m.id === id)
      if (!target) throw new Error('衣柜不存在')
      if (members.some((m) => m.id !== id && m.name === trimmed)) {
        throw new Error('这个名字已经有了')
      }
      await store.set(MEMBERS, id, { ...target, name: trimmed })
      const garments = await readGarments(store)
      for (const garment of garments) {
        if (garment.memberId === id) await putGarment(store, { ...garment, member: trimmed })
      }
    },

    async deleteMember(id: string, deleteClothes: boolean) {
      const members = await ensureMembers(store)
      if (!members.some((m) => m.id === id)) throw new Error('衣柜不存在')
      let deleted = 0
      if (deleteClothes) {
        const garments = await readGarments(store)
        const memberGarments = garments.filter((garment) => garment.memberId === id)
        const ids = new Set(memberGarments.map((garment) => garment.id))
        const outfits = await readOutfits(store)
        if (outfits.some((outfit) => outfitGarmentIds(outfit).some((garmentId) => ids.has(garmentId)))) {
          throw new Error('衣柜里有衣服正在被搭配使用，请先去「搭配」里删除相关搭配')
        }
        for (const garment of memberGarments) {
          if (garment.photoPath) await store.remove(COLLECTION, garment.photoPath)
          await store.remove(GARMENTS, garment.id)
          deleted += 1
        }
      }
      await store.remove(MEMBERS, id)
      return { deleted, photos: [] as string[] }
    },

    async exportBundle() {
      const garments = await readGarments(store)
      const photos: ExportBundle['photos'] = []
      for (const garment of garments) {
        if (!garment.photoPath) continue
        const dataUrl = await store.get<string>(COLLECTION, garment.photoPath)
        if (dataUrl) photos.push({ path: garment.photoPath, dataUrl })
      }
      const assets = await readAssets()
      const customAssets: CustomAsset[] = []
      for (const asset of assets) {
        const dataUrl = await store.get<string>(COLLECTION, asset.photoPath)
        if (dataUrl) customAssets.push(asset)
      }
      return {
        app: 'my-ai-wardrobe',
        version: 1,
        exportedAt: new Date().toISOString(),
        garments,
        logs: await readLogs(store),
        photos,
        customAssets
      }
    },

    async importBundle(bundle: ExportBundle) {
      return withAllocationLock(async () => {
        const current = await readGarments(store)
        const existing = new Set(current.map((g) => g.id))
        const working = [...current]
        let imported = 0

        for (const garment of bundle.garments) {
          const photo = bundle.photos.find((p) => p.path === garment.photoPath)
          let photoPath = garment.photoPath
          if (photo && garment.photoPath) {
            await store.set(COLLECTION, garment.photoPath, photo.dataUrl)
            photoPath = garment.photoPath
          }

          // 编号撞号时，在该分类里另找一个空缺号
          const usedCodes = new Set(working.map((g) => g.code))
          let code = garment.code
          const localItem = current.find((g) => g.id === garment.id)
          if (localItem) {
            code = localItem.code
          } else if (usedCodes.has(code)) {
            code = formatFrom(
              garment.category,
              working.map((g) => g.code)
            )
          }

          const next: Garment = { ...garment, code, photoPath }
          await putGarment(store, next)
          working.push(next)
          if (!existing.has(garment.id)) imported += 1
        }

        const logs = await readLogs(store)
        const knownLogs = new Set(logs.map((l) => l.id))
        let importedLogs = 0
        for (const log of bundle.logs) {
          if (knownLogs.has(log.id)) continue
          await store.set(LOGS, log.id, log)
          importedLogs += 1
        }

        // 导入自定义素材
        for (const asset of bundle.customAssets ?? []) {
          const photo = bundle.photos.find((p) => p.path === asset.photoPath)
          if (photo) await store.set(COLLECTION, asset.photoPath, photo.dataUrl)
          const known = await store.get<CustomAsset>(ASSETS, asset.id)
          if (!known) await store.set(ASSETS, asset.id, asset)
        }

        return { garments: imported, logs: importedLogs }
      })
    }
  }
}

/** 该分类的下一个可用编号（最小空缺） */
function formatFrom(category: Garment['category'], codes: string[]): string {
  return formatCode(category, smallestFreeSequence(category, codes))
}

function categoryPrefixOf(category: Garment['category']): string {
  return categoryPrefix(category)
}

/**
 * 数据自检：找出「分类和编号前缀对不上」的记录。
 * 只报告，不擅自修改。
 */
export interface CodeMismatch {
  id: string
  code: string
  name: string
  category: Garment['category']
  expectedPrefix: string
}

export function findCodeMismatches(garments: Garment[]): CodeMismatch[] {
  const result: CodeMismatch[] = []
  for (const garment of garments) {
    const parsed = parseCode(garment.code)
    const expectedPrefix = categoryPrefixOf(garment.category)
    if (!parsed || parsed.category !== garment.category) {
      result.push({
        id: garment.id,
        code: garment.code,
        name: garment.name,
        category: garment.category,
        expectedPrefix
      })
    }
  }
  return result
}

export async function resetLocalData(store: KeyValueStore = idbStore): Promise<void> {
  await store.clear(GARMENTS)
  await store.clear(LOGS)
  await store.clear(ASSETS)
  await store.clear(COLLECTION)
}

export { dataUrlToBlob }
