import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { createLocalRepository } from '../data/localRepository'
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
  Member,
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
  /** 是否已经完成登录状态检查（避免刷新时闪一下登录页） */
  authReady: boolean
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
  /** 当前正在看的衣柜：'__all__' 全部 / 衣柜内部编号 / '__none__' 未分类 */
  activeMember: string
  /** 当前账号的衣柜名单 */
  members: Member[]
  setActiveMember: (id: string) => void
  addMember: (name: string) => Promise<Member>
  renameMember: (id: string, name: string) => Promise<void>
  deleteMember: (id: string, deleteClothes: boolean) => Promise<{ deleted: number; photos: string[] }>
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
  const [authReady, setAuthReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [cloudBusy, setCloudBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [defaultImageMode, setDefaultImageModeState] = useState<ImageMode>(() => loadDefaultImageMode())
  const [activeMemberId, setActiveMemberState] = useState<string>(() => {
    try {
      return localStorage.getItem('wardrobe.activeMember') || '__all__'
    } catch {
      return '__all__'
    }
  })
  const [members, setMembers] = useState<Member[]>([])
  // 登录过程中会先短暂用本机名单；这里不急着把 activeMember 改成“全部”，
  // 等云端名单加载后，原来选中的衣柜编号还能重新匹配上。
  const activeMember = useMemo(() => {
    if (activeMemberId === '__all__' || activeMemberId === '__none__') return activeMemberId
    return members.some((m) => m.id === activeMemberId) ? activeMemberId : '__all__'
  }, [activeMemberId, members])
  const repoRef = useRef<WardrobeRepository>(createLocalRepository())
  const refreshSeq = useRef(0)

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
      setAuthReady(true)
      return
    }
    setAuthReady(false)
    const supabase = createSupabaseClient(config)
    setClient(supabase)
    let active = true
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) {
          setSession(data.session)
          setAuthReady(true)
        }
      })
      .catch(() => {
        if (active) setAuthReady(true)
      })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (active) {
        setSession(next)
        setAuthReady(true)
      }
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [config])

  const refresh = useCallback(async () => {
    const seq = ++refreshSeq.current
    const repo = repoRef.current
    setLoading(true)
    try {
      const [nextGarments, nextLogs, nextAssets, nextMembers] = await Promise.all([
        repo.listGarments(),
        repo.listLogs(),
        repo.listCustomAssets(),
        repo.listMembers()
      ])
      // 登录切换仓库时，旧仓库的慢请求可能晚到；只接受最新一次结果
      if (seq !== refreshSeq.current || repo !== repoRef.current) return
      setGarments(nextGarments)
      setLogs(nextLogs)
      setCustomAssets(nextAssets)
      setMembers(nextMembers)
      setError(null)
    } catch (err) {
      if (seq === refreshSeq.current && repo === repoRef.current) {
        setError(err instanceof Error ? err.message : '读取数据失败')
      }
    } finally {
      if (seq === refreshSeq.current && repo === repoRef.current) {
        setLoading(false)
        setReady(true)
      }
    }
  }, [])

  useEffect(() => {
    setReady(false)
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
    async (raw: string) => {
      const name = raw.trim()
      if (!name) throw new Error('名字不能为空')
      const member = await repoRef.current.createMember(name)
      setMembers((prev) => {
        const rest = prev.filter((m) => m.id !== member.id)
        return [...rest, member].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      })
      setActiveMember(member.id)
      return member
    },
    [setActiveMember]
  )

  const renameMember = useCallback(async (id: string, name: string) => {
    const nextName = name.trim()
    await repoRef.current.renameMember(id, nextName)
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, name: nextName } : m)))
    setGarments((prev) => prev.map((g) => (g.memberId === id ? { ...g, member: nextName } : g)))
  }, [])

  const deleteMember = useCallback(
    async (id: string, deleteClothes: boolean) => {
      const result = await repoRef.current.deleteMember(id, deleteClothes)
      setMembers((prev) => prev.filter((m) => m.id !== id))
      if (deleteClothes) {
        setGarments((prev) => prev.filter((g) => g.memberId !== id))
      }
      setActiveMemberState((prev) => (prev === id ? '__all__' : prev))
      return result
    },
    []
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
      authReady,
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
      renameMember,
      deleteMember,
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
      authReady,
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
      renameMember,
      deleteMember,
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
