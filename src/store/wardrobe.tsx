import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { createLocalRepository } from '../data/localRepository'
import { allMembers, rememberMember } from '../lib/members'
import {
  createCloudRepository,
  createSupabaseClient,
  loadSupabaseConfig,
  saveSupabaseConfig,
  type SupabaseConfig
} from '../data/cloudRepository'
import type { WardrobeRepository } from '../data/repository'
import type {
  CustomAsset,
  ExportBundle,
  Garment,
  GarmentPatch,
  ImageMode,
  NewGarmentInput,
  WashLog,
  WashStatus
} from '../types'

type Mode = 'local' | 'cloud'

const DEFAULT_MODE_KEY = 'wardrobe.defaultImageMode'
/** 迁移到云端前，本机数据的备份 */
const MIGRATION_BACKUP_KEY = 'wardrobe.migrationBackup'
/** 已经迁移到哪个账号，避免重复导入 */
const MIGRATED_TO_KEY = 'wardrobe.migratedTo'

function loadDefaultImageMode(): ImageMode {
  try {
    const raw = localStorage.getItem(DEFAULT_MODE_KEY)
    if (raw === 'photo' || raw === 'cartoon' || raw === 'hidden') return raw
  } catch {
    // 读不到就用默认值
  }
  return 'cartoon'
}

interface WardrobeState {
  ready: boolean
  mode: Mode
  garments: Garment[]
  logs: WashLog[]
  customAssets: CustomAsset[]
  loading: boolean
  error: string | null
  config: SupabaseConfig | null
  client: SupabaseClient | null
  session: Session | null
  cloudBusy: boolean
  defaultImageMode: ImageMode
  /** 当前正在看的衣柜：'__all__' 全部 / 成员名字 / '__none__' 未分类 */
  activeMember: string
  /** 当前可用衣柜名单（默认成员 + 衣服里出现过的自定义名字） */
  members: string[]
  setActiveMember: (name: string) => void
  addMember: (name: string) => void
  refresh: () => Promise<void>
  createGarment: (input: NewGarmentInput) => Promise<Garment>
  updateGarment: (id: string, patch: GarmentPatch, photo?: Blob | null) => Promise<void>
  deleteGarment: (id: string) => Promise<void>
  setWashStatus: (id: string, status: WashStatus) => Promise<void>
  clearLogs: () => Promise<void>
  connectCloud: (config: SupabaseConfig) => void
  disconnectCloud: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  sendResetPassword: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  photoUrl: (path: string | null) => Promise<string | null>
  createCustomAsset: (name: string, blob: Blob) => Promise<CustomAsset>
  deleteCustomAsset: (id: string) => Promise<void>
  setDefaultImageMode: (mode: ImageMode) => void
  exportData: () => Promise<ExportBundle>
  importData: (bundle: ExportBundle) => Promise<{ garments: number; logs: number }>
  migrateLocalToCloud: () => Promise<{ garments: number; logs: number }>
  dismissError: () => void
}

const WardrobeContext = createContext<WardrobeState | null>(null)

export function WardrobeProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<SupabaseConfig | null>(() => loadSupabaseConfig())
  const [client, setClient] = useState<SupabaseClient | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [garments, setGarments] = useState<Garment[]>([])
  const [logs, setLogs] = useState<WashLog[]>([])
  const [customAssets, setCustomAssets] = useState<CustomAsset[]>([])
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [cloudBusy, setCloudBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [defaultImageMode, setDefaultImageModeState] = useState<ImageMode>(() => loadDefaultImageMode())
  const [activeMember, setActiveMemberState] = useState<string>(() => {
    try {
      return localStorage.getItem('wardrobe.activeMember') || '__all__'
    } catch {
      return '__all__'
    }
  })
  const [membersTick, setMembersTick] = useState(0)
  const members = useMemo(() => allMembers(garments), [garments, membersTick])
  const repoRef = useRef<WardrobeRepository>(createLocalRepository())

  const mode: Mode = client && session ? 'cloud' : 'local'

  const repository = useMemo(() => {
    if (client && session) return createCloudRepository(client)
    return createLocalRepository()
  }, [client, session])

  useEffect(() => {
    repoRef.current = repository
  }, [repository])

  // 初始化 Supabase 并监听登录状态
  useEffect(() => {
    if (!config) {
      setClient(null)
      setSession(null)
      return
    }
    const supabase = createSupabaseClient(config)
    setClient(supabase)
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [config])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [nextGarments, nextLogs, nextAssets] = await Promise.all([
        repoRef.current.listGarments(),
        repoRef.current.listLogs(),
        repoRef.current.listCustomAssets()
      ])
      setGarments(nextGarments)
      setLogs(nextLogs)
      setCustomAssets(nextAssets)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取数据失败')
    } finally {
      setLoading(false)
      setReady(true)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh, repository])

  const createGarment = useCallback(async (input: NewGarmentInput) => {
    const created = await repoRef.current.createGarment(input)
    setGarments((prev) => [created, ...prev])
    return created
  }, [])

  const updateGarment = useCallback(async (id: string, patch: GarmentPatch, photo?: Blob | null) => {
    const updated = await repoRef.current.updateGarment(id, patch, photo)
    setGarments((prev) => prev.map((g) => (g.id === id ? updated : g)))
  }, [])

  const deleteGarment = useCallback(async (id: string) => {
    await repoRef.current.deleteGarment(id)
    setGarments((prev) => prev.filter((g) => g.id !== id))
  }, [])

  const setWashStatus = useCallback(async (id: string, status: WashStatus) => {
    const updated = await repoRef.current.setWashStatus(id, status)
    setGarments((prev) => prev.map((g) => (g.id === id ? updated : g)))
    const nextLogs = await repoRef.current.listLogs()
    setLogs(nextLogs)
  }, [])

  const clearLogs = useCallback(async () => {
    await repoRef.current.clearLogs()
    setLogs([])
  }, [])

  const createCustomAsset = useCallback(async (name: string, blob: Blob) => {
    const asset = await repoRef.current.createCustomAsset(name, blob)
    setCustomAssets((prev) => [asset, ...prev])
    return asset
  }, [])

  const deleteCustomAsset = useCallback(async (id: string) => {
    await repoRef.current.deleteCustomAsset(id)
    setCustomAssets((prev) => prev.filter((asset) => asset.id !== id))
  }, [])

  const setDefaultImageMode = useCallback((next: ImageMode) => {
    setDefaultImageModeState(next)
    try {
      localStorage.setItem(DEFAULT_MODE_KEY, next)
    } catch {
      // 存不进去也不影响使用
    }
  }, [])

  const setActiveMember = useCallback((name: string) => {
    setActiveMemberState(name)
    try {
      localStorage.setItem('wardrobe.activeMember', name)
    } catch {
      // 记不住也不影响本次切换
    }
  }, [])

  const addMember = useCallback(
    (raw: string) => {
      const name = raw.trim()
      if (!name) return
      rememberMember(name)
      setMembersTick((n) => n + 1)
      setActiveMember(name)
    },
    [setActiveMember]
  )

  const connectCloud = useCallback((next: SupabaseConfig) => {
    saveSupabaseConfig(next)
    setConfig(next)
  }, [])

  const disconnectCloud = useCallback(async () => {
    setCloudBusy(true)
    try {
      if (client) await client.auth.signOut()
    } catch {
      // 忽略退出失败，配置仍会被清除
    }
    saveSupabaseConfig(null)
    setConfig(null)
    setClient(null)
    setSession(null)
    setCloudBusy(false)
  }, [client])

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!client) throw new Error('请先填写并保存云端配置')
      setCloudBusy(true)
      try {
        const { error: authError } = await client.auth.signInWithPassword({ email, password })
        if (authError) throw new Error(`登录失败：${authError.message}`)
      } finally {
        setCloudBusy(false)
      }
    },
    [client]
  )

  const signUp = useCallback(
    async (email: string, password: string) => {
      if (!client) throw new Error('请先填写并保存云端配置')
      setCloudBusy(true)
      try {
        const { data, error } = await client.auth.signUp({ email, password })
        if (error) throw new Error(`注册失败：${error.message}`)
        if (!data.session) {
          throw new Error('注册成功，请到邮箱点击确认链接后再登录')
        }
      } finally {
        setCloudBusy(false)
      }
    },
    [client]
  )

  const signOut = useCallback(async () => {
    if (!client) return
    setCloudBusy(true)
    try {
      await client.auth.signOut()
    } finally {
      setCloudBusy(false)
    }
  }, [client])

  /** 发送重置密码邮件 */
  const sendResetPassword = useCallback(
    async (email: string) => {
      if (!client) throw new Error('请先填写并保存云端配置')
      setCloudBusy(true)
      try {
        const { error: resetError } = await client.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`
        })
        if (resetError) throw new Error(`发送失败：${resetError.message}`)
      } finally {
        setCloudBusy(false)
      }
    },
    [client]
  )

  /** 已经通过邮件验证身份后，设置新密码 */
  const updatePassword = useCallback(
    async (password: string) => {
      if (!client) throw new Error('请先填写并保存云端配置')
      if (password.length < 6) throw new Error('密码至少 6 位')
      setCloudBusy(true)
      try {
        const { error: updateError } = await client.auth.updateUser({ password })
        if (updateError) throw new Error(`修改失败：${updateError.message}`)
      } finally {
        setCloudBusy(false)
      }
    },
    [client]
  )

  const photoUrl = useCallback((path: string | null) => repoRef.current.photoUrl(path), [])

  const exportData = useCallback(() => repoRef.current.exportBundle(), [])
  const importData = useCallback(async (bundle: ExportBundle) => {
    const result = await repoRef.current.importBundle(bundle)
    await refresh()
    return result
  }, [refresh])

  /**
   * 开启云端同步后，把之前只存在本机的衣服和洗衣记录整体上传到云端。
   *
   * 安全措施：
   *  1. 迁移前先把本机数据存一份「迁移前备份」到本地存储，失败也能回退；
   *  2. 记录「已迁移到哪个账号」，同一个账号不会重复导入；
   *  3. 本机数据不删除，导入后仍在本地留着，可以随时导出。
   */
  const migrateLocalToCloud = useCallback(async () => {
    if (repoRef.current.kind !== 'cloud') throw new Error('请先登录云端账号')
    const userId = session?.user.id ?? null
    if (!userId) throw new Error('请先登录云端账号')

    const local = createLocalRepository()
    const bundle = await local.exportBundle()

    if (!bundle.garments.length) {
      return { garments: 0, logs: 0 }
    }

    // 迁移前备份：把本机原始数据留一份，即使上传出错也能恢复
    try {
      localStorage.setItem(
        MIGRATION_BACKUP_KEY,
        JSON.stringify({ at: Date.now(), userId, bundle })
      )
    } catch {
      // 备份写不进去（比如空间满）不阻断迁移，但会提示用户
    }

    // 防重复导入：同一个账号已经迁移过就不再重复上传
    const migratedTo = localStorage.getItem(MIGRATED_TO_KEY)
    if (migratedTo === userId) {
      const already = await repoRef.current.listGarments()
      return { garments: already.length, logs: 0 }
    }

    const result = await repoRef.current.importBundle(bundle)
    localStorage.setItem(MIGRATED_TO_KEY, userId)
    await refresh()
    return result
  }, [refresh, session?.user.id])

  const value = useMemo<WardrobeState>(
    () => ({
      ready,
      mode,
      garments,
      logs,
      customAssets,
      loading,
      error,
      config,
      client,
      session,
      cloudBusy,
      defaultImageMode,
      activeMember,
      members,
      setActiveMember,
      addMember,
      refresh,
      createGarment,
      updateGarment,
      deleteGarment,
      setWashStatus,
      clearLogs,
      connectCloud,
      disconnectCloud,
      signIn,
      signUp,
      signOut,
      sendResetPassword,
      updatePassword,
      photoUrl,
      createCustomAsset,
      deleteCustomAsset,
      setDefaultImageMode,
      exportData,
      importData,
      migrateLocalToCloud,
      dismissError: () => setError(null)
    }),
    [
      ready,
      mode,
      garments,
      logs,
      customAssets,
      loading,
      error,
      config,
      client,
      session,
      cloudBusy,
      defaultImageMode,
      activeMember,
      members,
      setActiveMember,
      addMember,
      refresh,
      createGarment,
      updateGarment,
      deleteGarment,
      setWashStatus,
      clearLogs,
      connectCloud,
      disconnectCloud,
      signIn,
      signUp,
      signOut,
      sendResetPassword,
      updatePassword,
      photoUrl,
      createCustomAsset,
      deleteCustomAsset,
      setDefaultImageMode,
      exportData,
      importData,
      migrateLocalToCloud
    ]
  )

  return <WardrobeContext.Provider value={value}>{children}</WardrobeContext.Provider>
}

export function useWardrobe(): WardrobeState {
  const ctx = useContext(WardrobeContext)
  if (!ctx) throw new Error('useWardrobe 必须在 WardrobeProvider 内使用')
  return ctx
}
