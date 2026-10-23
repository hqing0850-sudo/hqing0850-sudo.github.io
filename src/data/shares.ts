import type { SupabaseClient } from '@supabase/supabase-js'
import { loadSupabaseConfig } from './cloudRepository'
import type { Category, Garment, ImageMode, Season, Thickness, WashStatus } from '../types'

/** 分享出去的只读衣服信息（不含备注、照片路径等内部字段） */
export interface SharedGarment {
  id: string
  code: string
  category: Category
  name: string
  color: string
  seasons: Season[]
  thickness: Thickness
  washStatus: WashStatus
  displayMode: ImageMode
  cartoonId: string | null
  hasPhoto: boolean
}

export interface SharePayload {
  version: 1
  title: string
  createdAt: string
  garments: SharedGarment[]
}

export interface ShareRecord {
  token: string
  title: string
  createdAt: number
  count: number
}

const SHARE_BUCKET = 'shared'

/** 生成 32 位十六进制随机 token（不可猜） */
export function createShareToken(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function toShared(g: Garment): SharedGarment {
  return {
    id: g.id,
    code: g.code,
    category: g.category,
    name: g.name,
    color: g.color,
    seasons: g.seasons,
    thickness: g.thickness,
    washStatus: g.washStatus,
    displayMode: g.displayMode,
    cartoonId: g.cartoonId,
    hasPhoto: false
  }
}

/**
 * 生成一个只读分享：先建分享记录，再把照片复制到公开的 shared 桶里。
 * 照片放在 token 目录下，只有拿到链接的人才知道地址；撤销时连同照片一起删除。
 */
export async function createShare(
  client: SupabaseClient,
  userId: string,
  garments: Garment[],
  photoUrl: (path: string | null) => Promise<string | null>,
  title: string,
  onProgress?: (done: number, total: number) => void
): Promise<ShareRecord> {
  const token = createShareToken()
  const visible = garments.filter((g) => g.displayMode !== 'hidden')
  const payload: SharePayload = {
    version: 1,
    title: title.trim() || '我的衣橱',
    createdAt: new Date().toISOString(),
    garments: visible.map(toShared)
  }

  const { error: insertError } = await client.from('wardrobe_shares').insert({
    token,
    user_id: userId,
    title: payload.title,
    payload
  })
  if (insertError) throw new Error(`创建分享失败：${insertError.message}`)

  const needPhoto = visible.filter((g) => g.displayMode === 'photo' && g.photoPath)
  let done = 0
  for (const g of needPhoto) {
    try {
      const url = await photoUrl(g.photoPath)
      if (!url) continue
      const response = await fetch(url)
      if (!response.ok) continue
      const blob = await response.blob()
      const { error: uploadError } = await client.storage
        .from(SHARE_BUCKET)
        .upload(`${token}/${g.id}`, blob, { upsert: true, contentType: blob.type || 'image/jpeg' })
      if (!uploadError) {
        const target = payload.garments.find((item) => item.id === g.id)
        if (target) target.hasPhoto = true
      }
    } catch {
      // 单张照片失败不影响整个分享，页面会显示占位
    } finally {
      done += 1
      onProgress?.(done, needPhoto.length)
    }
  }

  const { error: updateError } = await client
    .from('wardrobe_shares')
    .update({ payload, updated_at: new Date().toISOString() })
    .eq('token', token)
  if (updateError) throw new Error(`保存分享失败：${updateError.message}`)

  return { token, title: payload.title, createdAt: Date.now(), count: visible.length }
}

export async function listShares(client: SupabaseClient, userId: string): Promise<ShareRecord[]> {
  const { data, error } = await client
    .from('wardrobe_shares')
    .select('token,title,payload,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`读取分享列表失败：${error.message}`)
  return (data ?? []).map((row: { token: string; title: string; payload: SharePayload; created_at: string }) => ({
    token: row.token,
    title: row.title,
    createdAt: new Date(row.created_at).getTime(),
    count: Array.isArray(row.payload?.garments) ? row.payload.garments.length : 0
  }))
}

/** 撤销分享：先删照片，再删记录 */
export async function revokeShare(client: SupabaseClient, token: string): Promise<void> {
  const { data: files } = await client.storage.from(SHARE_BUCKET).list(token, { limit: 1000 })
  if (files?.length) {
    await client.storage.from(SHARE_BUCKET).remove(files.map((file) => `${token}/${file.name}`))
  }
  const { error } = await client.from('wardrobe_shares').delete().eq('token', token)
  if (error) throw new Error(`撤销失败：${error.message}`)
}

/** 访客读取分享内容（不需要登录） */
export async function fetchShared(token: string): Promise<SharePayload | null> {
  const config = loadSupabaseConfig()
  if (!config) throw new Error('这个链接所属的网站还没有配置云端')
  const response = await fetch(`${config.url.replace(/\/$/, '')}/rest/v1/rpc/get_shared_wardrobe`, {
    method: 'POST',
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ p_token: token })
  })
  if (!response.ok) throw new Error('链接无效或已经失效')
  const data = (await response.json()) as SharePayload | null
  if (!data || !Array.isArray(data.garments)) return null
  return data
}

/** 分享照片的公开地址 */
export function sharedPhotoUrl(token: string, garmentId: string): string | null {
  const config = loadSupabaseConfig()
  if (!config) return null
  const base = config.url.replace(/\/$/, '')
  return `${base}/storage/v1/object/public/${SHARE_BUCKET}/${token}/${garmentId}`
}
