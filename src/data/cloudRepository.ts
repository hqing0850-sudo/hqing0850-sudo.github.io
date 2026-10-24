import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { formatCode } from '../lib/numbering'
import { newId } from '../lib/image'
import type {
  Category,
  CustomAsset,
  ExportBundle,
  Garment,
  GarmentPatch,
  ImageMode,
  Member,
  NewGarmentInput,
  WashLog,
  WashStatus
} from '../types'
import { buildLog, type WardrobeRepository } from './repository'

export interface SupabaseConfig {
  url: string
  anonKey: string
}

const CONFIG_KEY = 'wardrobe.supabase.config'

export function loadSupabaseConfig(): SupabaseConfig | null {
  const envUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (envUrl && envKey) return { url: envUrl, anonKey: envKey }
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SupabaseConfig
    if (!parsed.url || !parsed.anonKey) return null
    return parsed
  } catch {
    return null
  }
}

export function saveSupabaseConfig(config: SupabaseConfig | null): void {
  if (!config) {
    localStorage.removeItem(CONFIG_KEY)
    return
  }
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
}

export function createSupabaseClient(config: SupabaseConfig): SupabaseClient {
  return createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // 打开后，「忘记密码」邮件里的链接才能自动带上登录态
      detectSessionInUrl: true
    }
  })
}

const BUCKET = 'photos'

type GarmentRow = {
  id: string
  code: string
  category: Category
  member: string | null
  member_id: string | null
  name: string
  color: string
  seasons: string[]
  thickness: Garment['thickness']
  notes: string
  photo_path: string | null
  display_mode: ImageMode | null
  cartoon_id: string | null
  custom_asset_id: string | null
  wash_status: WashStatus
  status_changed_at: string
  last_washed_at: string | null
  wear_count: number
  created_at: string
  updated_at: string
}

type LogRow = {
  id: string
  item_id: string
  item_code: string
  item_name: string
  category: Category
  from_status: WashStatus | null
  to_status: WashStatus
  at: string
}

type AssetRow = {
  id: string
  name: string
  photo_path: string
  created_at: string
}

const toMillis = (value: string | null): number | null => (value ? new Date(value).getTime() : null)

function rowToGarment(row: GarmentRow): Garment {
  return {
    id: row.id,
    code: row.code,
    category: row.category,
    member: row.member ?? '',
    memberId: row.member_id ?? null,
    name: row.name,
    color: row.color ?? '',
    seasons: (row.seasons ?? []) as Garment['seasons'],
    thickness: row.thickness,
    notes: row.notes ?? '',
    photoPath: row.photo_path,
    displayMode: row.display_mode ?? 'photo',
    cartoonId: row.cartoon_id ?? null,
    customAssetId: row.custom_asset_id ?? null,
    washStatus: row.wash_status,
    statusChangedAt: toMillis(row.status_changed_at) ?? Date.now(),
    lastWashedAt: toMillis(row.last_washed_at),
    wearCount: row.wear_count ?? 0,
    createdAt: toMillis(row.created_at) ?? Date.now(),
    updatedAt: toMillis(row.updated_at) ?? Date.now()
  }
}

function rowToLog(row: LogRow): WashLog {
  return {
    id: row.id,
    itemId: row.item_id,
    itemCode: row.item_code,
    itemName: row.item_name,
    category: row.category,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    at: toMillis(row.at) ?? Date.now()
  }
}

function rowToAsset(row: AssetRow): CustomAsset {
  return {
    id: row.id,
    name: row.name,
    photoPath: row.photo_path,
    createdAt: toMillis(row.created_at) ?? Date.now()
  }
}

function dataUrlToBlobForUpload(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(',')
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? 'image/jpeg'
  const bin = atob(body ?? '')
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export function createCloudRepository(client: SupabaseClient): WardrobeRepository {
  const signedCache = new Map<string, { url: string; expires: number }>()

  async function requireUserId(): Promise<string> {
    const { data, error } = await client.auth.getUser()
    if (error || !data.user) throw new Error('登录已过期，请重新登录')
    return data.user.id
  }

  async function uploadPhoto(userId: string, garmentId: string, blob: Blob): Promise<string> {
    const path = `${userId}/${garmentId}-${Date.now()}.jpg`
    const { error } = await client.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: true })
    if (error) throw new Error(`照片上传失败：${error.message}`)
    // 上传后再写入路径，避免留下无主文件
    return path
  }

  async function uploadAsset(userId: string, assetId: string, blob: Blob): Promise<string> {
    const path = `${userId}/custom/${assetId}-${Date.now()}.jpg`
    const { error } = await client.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: true })
    if (error) throw new Error(`图片上传失败：${error.message}`)
    return path
  }

  async function removePhoto(path: string | null): Promise<void> {
    if (!path) return
    await client.storage.from(BUCKET).remove([path])
    signedCache.delete(path)
  }

  async function listGarments(): Promise<Garment[]> {
    const { data, error } = await client
      .from('garments')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw new Error(`读取衣服失败：${error.message}`)
    return (data as GarmentRow[]).map(rowToGarment)
  }

  async function listLogs(): Promise<WashLog[]> {
    const { data, error } = await client
      .from('wash_logs')
      .select('*')
      .order('at', { ascending: false })
      .limit(1000)
    if (error) throw new Error(`读取洗衣记录失败：${error.message}`)
    return (data as LogRow[]).map(rowToLog)
  }

  async function listAssets(): Promise<CustomAsset[]> {
    const { data, error } = await client
      .from('custom_assets')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw new Error(`读取自定义图片失败：${error.message}`)
    return (data as AssetRow[]).map(rowToAsset)
  }

  /**
   * 向数据库要一个该分类的下一个可用编号。
   * 数据库端的规则和本机一致：从 001 开始找最小空缺。
   */
  async function nextSequence(category: Category): Promise<number> {
    const { data, error } = await client.rpc('next_garment_sequence', { p_category: category })
    if (error) throw new Error(`编号分配失败：${error.message}`)
    return Number(data)
  }

  /** 是不是「编号已被别的记录占用」这类冲突 */
  function isDuplicateCodeError(message: string): boolean {
    return /duplicate key|unique/i.test(message)
  }

  return {
    kind: 'cloud',

    async listGarments() {
      return listGarments()
    },

    async createGarment(input: NewGarmentInput) {
      const userId = await requireUserId()
      const id = newId()
      let photoPath: string | null = null
      if (input.photo) photoPath = await uploadPhoto(userId, id, input.photo)

      const now = new Date().toISOString()

      // 两台设备同时添加可能拿到同一个号，撞号了就换一个再来，最多试 5 次
      let lastError = '编号反复被占用，请稍后重试'
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const code = formatCode(input.category, await nextSequence(input.category))
        const payload = {
          id,
          user_id: userId,
          code,
          category: input.category,
          member: input.member?.trim() ?? '',
          member_id: input.memberId ?? null,
          name: input.name.trim() || code,
          color: input.color.trim(),
          seasons: input.seasons,
          thickness: input.thickness,
          notes: input.notes.trim(),
          photo_path: photoPath,
          display_mode: input.displayMode,
          cartoon_id: input.cartoonId,
          custom_asset_id: input.customAssetId,
          wash_status: 'clean',
          status_changed_at: now,
          last_washed_at: null,
          wear_count: 0,
          created_at: now,
          updated_at: now
        }

        const { data, error } = await client.from('garments').insert(payload).select('*').single()
        if (!error) return rowToGarment(data as GarmentRow)
        lastError = error.message
        if (isDuplicateCodeError(error.message)) continue
        await removePhoto(photoPath)
        throw new Error(`保存失败：${error.message}`)
      }

      await removePhoto(photoPath)
      throw new Error(`保存失败：${lastError}`)
    },

    async updateGarment(id: string, patch: GarmentPatch, photo?: Blob | null) {
      const userId = await requireUserId()
      const { data: currentRow, error: readError } = await client
        .from('garments')
        .select('*')
        .eq('id', id)
        .single()
      if (readError || !currentRow) throw new Error('衣服不存在或已被删除')
      const current = rowToGarment(currentRow as GarmentRow)

      let photoPath = current.photoPath
      if (photo === null) {
        await removePhoto(photoPath)
        photoPath = null
      } else if (photo) {
        const uploaded = await uploadPhoto(userId, id, photo)
        await removePhoto(photoPath)
        photoPath = uploaded
      }

      const now = new Date()
      const changingStatus = patch.washStatus !== undefined && patch.washStatus !== current.washStatus

      // 换了分类就在新分类里找最小空缺编号
      let code = current.code
      if (patch.category && patch.category !== current.category) {
        code = formatCode(patch.category, await nextSequence(patch.category))
      }

      const updates = {
        name: patch.name ?? current.name,
        color: patch.color ?? current.color,
        category: patch.category ?? current.category,
        member: patch.member ?? current.member,
        member_id: patch.memberId === undefined ? current.memberId : patch.memberId,
        code,
        seasons: patch.seasons ?? current.seasons,
        thickness: patch.thickness ?? current.thickness,
        notes: patch.notes ?? current.notes,
        photo_path: photoPath,
        display_mode: patch.displayMode ?? current.displayMode,
        cartoon_id: patch.cartoonId === undefined ? current.cartoonId : patch.cartoonId,
        custom_asset_id: patch.customAssetId === undefined ? current.customAssetId : patch.customAssetId,
        wash_status: patch.washStatus ?? current.washStatus,
        status_changed_at: changingStatus
          ? now.toISOString()
          : new Date(current.statusChangedAt).toISOString(),
        updated_at: now.toISOString()
      }

      const { data, error } = await client.from('garments').update(updates).eq('id', id).select('*').single()
      if (error) throw new Error(`更新失败：${error.message}`)
      return rowToGarment(data as GarmentRow)
    },

    async deleteGarment(id: string) {
      const { data } = await client.from('garments').select('photo_path').eq('id', id).single()
      const { error } = await client.from('garments').delete().eq('id', id)
      if (error) throw new Error(`删除失败：${error.message}`)
      await removePhoto((data as { photo_path: string | null } | null)?.photo_path ?? null)
    },

    async setWashStatus(id: string, status: WashStatus) {
      const { data: currentRow, error: readError } = await client
        .from('garments')
        .select('*')
        .eq('id', id)
        .single()
      if (readError || !currentRow) throw new Error('衣服不存在或已被删除')
      const current = rowToGarment(currentRow as GarmentRow)
      if (current.washStatus === status) return current

      const now = new Date().toISOString()
      const { data, error } = await client
        .from('garments')
        .update({
          wash_status: status,
          status_changed_at: now,
          last_washed_at: status === 'clean' ? now : currentRow.last_washed_at,
          updated_at: now
        })
        .eq('id', id)
        .select('*')
        .single()
      if (error) throw new Error(`状态更新失败：${error.message}`)

      const updated = rowToGarment(data as GarmentRow)
      const log = buildLog(updated, current.washStatus, status)
      await client.from('wash_logs').insert({
        id: log.id,
        item_id: updated.id,
        item_code: updated.code,
        item_name: updated.name,
        category: updated.category,
        from_status: current.washStatus,
        to_status: status,
        at: new Date(log.at).toISOString()
      })
      return updated
    },

    async listLogs() {
      return listLogs()
    },

    async clearLogs() {
      const userId = await requireUserId()
      const { error } = await client.from('wash_logs').delete().eq('user_id', userId)
      if (error) throw new Error(`清空记录失败：${error.message}`)
    },

    async photoUrl(path: string | null) {
      if (!path) return null
      const cached = signedCache.get(path)
      if (cached && cached.expires > Date.now() + 60_000) return cached.url
      const { data, error } = await client.storage.from(BUCKET).createSignedUrl(path, 60 * 60)
      if (error || !data) return null
      signedCache.set(path, { url: data.signedUrl, expires: Date.now() + 55 * 60_000 })
      return data.signedUrl
    },

    async listCustomAssets() {
      return listAssets()
    },

    async createCustomAsset(name: string, blob: Blob) {
      const userId = await requireUserId()
      const id = newId()
      const photoPath = await uploadAsset(userId, id, blob)
      const { data, error } = await client
        .from('custom_assets')
        .insert({
          id,
          user_id: userId,
          name: name.trim() || '自定义图片',
          photo_path: photoPath,
          created_at: new Date().toISOString()
        })
        .select('*')
        .single()
      if (error) throw new Error(`保存自定义图片失败：${error.message}`)
      return rowToAsset(data as AssetRow)
    },

    async deleteCustomAsset(id: string) {
      const { data } = await client.from('custom_assets').select('photo_path').eq('id', id).single()
      const { error } = await client.from('custom_assets').delete().eq('id', id)
      if (error) throw new Error(`删除自定义图片失败：${error.message}`)
      await removePhoto((data as { photo_path: string | null } | null)?.photo_path ?? null)
    },

    async listMembers() {
      const { data, error } = await client
        .from('wardrobe_members')
        .select('id,name,sort_order')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) throw new Error(`读取衣柜失败：${error.message}`)
      return (data ?? []).map((row: { id: string; name: string; sort_order: number }) => ({
        id: row.id,
        name: row.name,
        sortOrder: row.sort_order
      })) as Member[]
    },

    async createMember(name: string) {
      const userId = await requireUserId()
      const trimmed = name.trim()
      if (!trimmed) throw new Error('名字不能为空')
      const id = newId()
      const { data, error } = await client
        .from('wardrobe_members')
        .insert({ id, user_id: userId, name: trimmed, sort_order: Math.floor(Date.now() / 1000) })
        .select('*')
        .single()
      if (error) {
        const duplicate = error.code === '23505' || error.message.includes('duplicate')
        throw new Error(duplicate ? '这个名字已经有了' : `创建衣柜失败：${error.message}`)
      }
      return { id: data.id, name: data.name, sortOrder: data.sort_order } as Member
    },

    async renameMember(id: string, name: string) {
      const trimmed = name.trim()
      if (!trimmed) throw new Error('名字不能为空')
      const { error } = await client.rpc('rename_wardrobe', { p_id: id, p_new_name: trimmed })
      if (error) throw new Error(error.message)
    },

    async deleteMember(id: string, deleteClothes: boolean) {
      const { data, error } = await client.rpc('delete_wardrobe', {
        p_id: id,
        p_delete_clothes: deleteClothes
      })
      if (error) throw new Error(error.message)
      const result = (data ?? {}) as { deleted?: number; photos?: string[] }
      const photos = Array.isArray(result.photos) ? result.photos : []
      if (photos.length) {
        try {
          await client.storage.from(BUCKET).remove(photos)
        } catch {
          // 衣柜已经删掉，照片清理失败不阻断
        }
      }
      return { deleted: result.deleted ?? 0, photos }
    },

    async exportBundle() {
      const garments = await listGarments()
      const photos: ExportBundle['photos'] = []
      for (const garment of garments) {
        if (!garment.photoPath) continue
        const { data } = await client.storage.from(BUCKET).download(garment.photoPath)
        if (!data) continue
        const buffer = await data.arrayBuffer()
        const bytes = new Uint8Array(buffer)
        let binary = ''
        for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
        photos.push({ path: garment.photoPath, dataUrl: `data:image/jpeg;base64,${btoa(binary)}` })
      }

      const assets = await listAssets()
      const customAssets: CustomAsset[] = []
      for (const asset of assets) {
        const { data } = await client.storage.from(BUCKET).download(asset.photoPath)
        if (!data) continue
        const buffer = await data.arrayBuffer()
        const bytes = new Uint8Array(buffer)
        let binary = ''
        for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
        photos.push({ path: asset.photoPath, dataUrl: `data:image/jpeg;base64,${btoa(binary)}` })
        customAssets.push(asset)
      }

      return {
        app: 'my-ai-wardrobe',
        version: 1,
        exportedAt: new Date().toISOString(),
        garments,
        logs: await listLogs(),
        photos,
        customAssets
      }
    },

    async importBundle(bundle: ExportBundle) {
      const userId = await requireUserId()
      const current = await listGarments()
      const existing = new Set(current.map((g) => g.id))
      const usedCodes = new Set(current.map((g) => g.code))
      let imported = 0

      for (const asset of bundle.customAssets ?? []) {
        const photo = bundle.photos.find((p) => p.path === asset.photoPath)
        if (!photo) continue
        const blob = dataUrlToBlobForUpload(photo.dataUrl)
        const photoPath = await uploadAsset(userId, asset.id, blob)
        const { error } = await client.from('custom_assets').insert({
          id: asset.id,
          user_id: userId,
          name: asset.name,
          photo_path: photoPath,
          created_at: new Date(asset.createdAt).toISOString()
        })
        if (error) {
          // 已存在就忽略
        }
      }

      for (const garment of bundle.garments) {
        if (existing.has(garment.id)) continue
        let photoPath: string | null = null
        const photo = bundle.photos.find((p) => p.path === garment.photoPath)
        if (photo) {
          const blob = dataUrlToBlobForUpload(photo.dataUrl)
          photoPath = await uploadPhoto(userId, garment.id, blob)
        }
        // 编号撞号时重新分配一个，保证编号始终唯一
        let code = garment.code
        if (usedCodes.has(code)) {
          code = formatCode(garment.category, await nextSequence(garment.category))
        }
        usedCodes.add(code)

        const { error } = await client.from('garments').insert({
          id: garment.id,
          user_id: userId,
          code,
          category: garment.category,
          member: garment.member ?? '',
          member_id: garment.memberId ?? null,
          name: garment.name,
          color: garment.color,
          seasons: garment.seasons,
          thickness: garment.thickness,
          notes: garment.notes,
          photo_path: photoPath,
          display_mode: garment.displayMode,
          cartoon_id: garment.cartoonId,
          custom_asset_id: garment.customAssetId,
          wash_status: garment.washStatus,
          status_changed_at: new Date(garment.statusChangedAt).toISOString(),
          last_washed_at: garment.lastWashedAt ? new Date(garment.lastWashedAt).toISOString() : null,
          wear_count: garment.wearCount ?? 0,
          created_at: new Date(garment.createdAt).toISOString(),
          updated_at: new Date().toISOString()
        })
        if (!error) imported += 1
      }

      const existingLogs = new Set((await listLogs()).map((l) => l.id))
      let importedLogs = 0
      for (const log of bundle.logs) {
        if (existingLogs.has(log.id)) continue
        const { error } = await client.from('wash_logs').insert({
          id: log.id,
          item_id: log.itemId,
          item_code: log.itemCode,
          item_name: log.itemName,
          category: log.category,
          from_status: log.fromStatus,
          to_status: log.toStatus,
          at: new Date(log.at).toISOString()
        })
        if (!error) importedLogs += 1
      }

      return { garments: imported, logs: importedLogs }
    }
  }
}
