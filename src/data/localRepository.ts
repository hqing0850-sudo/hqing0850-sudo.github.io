import { categoryPrefix, formatCode, parseCode, smallestFreeSequence } from '../lib/numbering'
import { blobToDataUrl, dataUrlToBlob, newId } from '../lib/image'
import type {
  CustomAsset,
  ExportBundle,
  Garment,
  GarmentPatch,
  NewGarmentInput,
  WashLog,
  WashStatus
} from '../types'
import { idbStore, type KeyValueStore } from './idb'
import { buildLog, type WardrobeRepository } from './repository'

const COLLECTION = 'local'
const GARMENTS = 'garments'
const LOGS = 'logs'
const ASSETS = 'customAssets'
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
    displayMode: garment.displayMode ?? 'photo',
    cartoonId: garment.cartoonId ?? null,
    customAssetId: garment.customAssetId ?? null
  }
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
        const garment: Garment = {
          id,
          code,
          category: input.category,
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

        const next: Garment = {
          ...current,
          ...patch,
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
