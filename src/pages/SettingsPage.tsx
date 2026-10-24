import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Toast } from '../components/Toast'
import { createLocalRepository, findCodeMismatches } from '../data/localRepository'
import { createShare, listShares, revokeShare, type ShareRecord } from '../data/shares'
import { formatCode, maxSequenceFromCodes, smallestFreeSequence, usedSequences } from '../lib/numbering'
import { usePwaInstall } from '../lib/pwa'
import { useWardrobe } from '../store/wardrobe'
import { CATEGORY_META, IMAGE_MODES, IMAGE_MODE_META } from '../types'
import type { ExportBundle } from '../types'

type Tone = 'info' | 'error'

/** 记住家庭账号邮箱，之后每台设备只需要输家庭码 */
const REMEMBER_EMAIL_KEY = 'wardrobe.familyEmail'

function CustomAssetThumb({ photoPath, name }: { photoPath: string; name: string }) {
  const { photoUrl } = useWardrobe()
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    photoUrl(photoPath).then((url) => {
      if (active) setSrc(url)
    })
    return () => {
      active = false
    }
  }, [photoPath, photoUrl])

  return src ? <img src={src} alt={name} /> : <span className="asset-loading">…</span>
}

export function SettingsPage() {
  const navigate = useNavigate()
  const {
    mode,
    config,
    client,
    session,
    garments,
    logs,
    connectCloud,
    disconnectCloud,
    signIn,
    signOut,
    updatePassword,
    exportData,
    importData,
    migrateLocalToCloud,
    defaultImageMode,
    setDefaultImageMode,
    customAssets,
    createCustomAsset,
    deleteCustomAsset,
    refresh,
    photoUrl
  } = useWardrobe()
  const [url, setUrl] = useState(config?.url ?? '')
  const [anonKey, setAnonKey] = useState(config?.anonKey ?? '')
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem(REMEMBER_EMAIL_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [includePhotos, setIncludePhotos] = useState(true)
  const [toast, setToast] = useState<{ message: string; tone: Tone } | null>(null)
  const [localCount, setLocalCount] = useState<number | null>(null)
  const [shares, setShares] = useState<ShareRecord[]>([])
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null)
  const [shareBusy, setShareBusy] = useState(false)
  const [shareProgress, setShareProgress] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const assetRef = useRef<HTMLInputElement>(null)
  const { canInstall, install, standalone } = usePwaInstall()

  // 数据自检：找出「分类和编号前缀对不上」的记录（只报告，不自动改）
  const mismatches = useMemo(() => findCodeMismatches(garments), [garments])

  // 各分类当前占用到的编号，方便核对编号是否正常
  const sequenceInfo = useMemo(() => {
    const codes = garments.map((g) => g.code)
    return (['top', 'outerwear', 'pants'] as const).map((category) => ({
      category,
      used: usedSequences(category, codes).size,
      max: maxSequenceFromCodes(category, codes),
      next: formatCode(category, smallestFreeSequence(category, codes))
    }))
  }, [garments])

  // 登录云端后，看看这台设备上还残留多少只在本机的衣服
  useEffect(() => {
    if (mode !== 'cloud') {
      setLocalCount(null)
      return
    }
    let active = true
    createLocalRepository()
      .listGarments()
      .then((list) => {
        if (active) setLocalCount(list.length)
      })
      .catch(() => {
        if (active) setLocalCount(0)
      })
    return () => {
      active = false
    }
  }, [mode, refresh])

  // 已登录云端时，读取自己生成过的分享链接
  useEffect(() => {
    if (!client || !session) {
      setShares([])
      return
    }
    let active = true
    listShares(client, session.user.id)
      .then((list) => {
        if (active) setShares(list)
      })
      .catch(() => {
        if (active) setShares([])
      })
    return () => {
      active = false
    }
  }, [client, session, refresh])

  function notify(message: string, tone: Tone = 'info') {
    setToast({ message, tone })
  }

  async function handleSaveConfig() {
    if (!url.trim() || !anonKey.trim()) {
      notify('请把项目地址和 anon public 密钥都填上', 'error')
      return
    }
    connectCloud({ url: url.trim(), anonKey: anonKey.trim() })
    notify('云端配置已保存，请再登录账号')
  }

  async function handleSignIn() {
    if (!email.trim() || !password) {
      notify('请填写邮箱和家庭码', 'error')
      return
    }
    setBusy(true)
    try {
      await signIn(email.trim(), password)
      try {
        localStorage.setItem(REMEMBER_EMAIL_KEY, email.trim())
      } catch {
        // 记不住邮箱也不影响本次登录
      }
      notify('登录成功，正在读取家庭衣橱…')
      await refresh()
    } catch (error) {
      notify(error instanceof Error ? error.message : '登录失败', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handleChangeCode() {
    const next = window.prompt('设置新的家庭码（至少 8 位，建议字母+数字）：')
    if (!next) return
    if (next.length < 8) {
      notify('家庭码至少 8 位', 'error')
      return
    }
    setBusy(true)
    try {
      await updatePassword(next)
      notify('家庭码已修改，记得告诉家人新码')
    } catch (error) {
      notify(error instanceof Error ? error.message : '修改失败', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handleSignOut() {
    setBusy(true)
    try {
      await signOut()
      notify('已退出账号，回到本机数据')
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function handleDisconnect() {
    setBusy(true)
    try {
      await disconnectCloud()
      setUrl('')
      setAnonKey('')
      notify('已断开云端，本机数据仍然保留')
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function handleMigrate() {
    setBusy(true)
    try {
      const result = await migrateLocalToCloud()
      notify(
        result.garments
          ? `已上传 ${result.garments} 件衣服、${result.logs} 条洗衣记录`
          : '这台设备上没有需要上传的数据'
      )
      setLocalCount(0)
    } catch (error) {
      notify(error instanceof Error ? error.message : '上传失败', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handleCreateShare() {
    if (!client || !session || !photoUrl) return
    setShareBusy(true)
    setShareProgress('正在准备…')
    try {
      const record = await createShare(
        client,
        session.user.id,
        garments,
        photoUrl,
        '我的衣橱',
        (done, total) => setShareProgress(`正在上传照片 ${done}/${total}`)
      )
      setShares((prev) => [record, ...prev])
      await copyShareLink(record.token)
    } catch (error) {
      notify(error instanceof Error ? error.message : '生成分享失败', 'error')
    } finally {
      setShareBusy(false)
      setShareProgress(null)
    }
  }

  async function copyShareLink(token: string) {
    const link = `${window.location.origin}/s/${token}`
    try {
      await navigator.clipboard.writeText(link)
      notify('分享链接已复制，发给别人即可打开')
    } catch {
      window.prompt('复制这个链接发给别人：', link)
    }
  }

  async function handleRevokeShare(token: string) {
    if (!client) return
    setShareBusy(true)
    try {
      await revokeShare(client, token)
      setShares((prev) => prev.filter((item) => item.token !== token))
      notify('已撤销这个分享链接')
    } catch (error) {
      notify(error instanceof Error ? error.message : '撤销失败', 'error')
    } finally {
      setShareBusy(false)
      setConfirmRevoke(null)
    }
  }

  async function handleAssetUpload(file: File | undefined) {
    if (!file) return
    setBusy(true)
    try {
      const name = file.name.replace(/\.[^.]+$/, '').slice(0, 20) || '自定义图片'
      await createCustomAsset(name, file)
      notify('自定义图片已加入素材库')
    } catch (error) {
      notify(error instanceof Error ? error.message : '上传失败', 'error')
    } finally {
      setBusy(false)
      if (assetRef.current) assetRef.current.value = ''
    }
  }

  async function handleExport() {
    setBusy(true)
    try {
      const bundle = await exportData()
      const payload: ExportBundle = includePhotos
        ? bundle
        : { ...bundle, photos: [], garments: bundle.garments.map((g) => ({ ...g, photoPath: null })) }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const urlObject = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const stamp = new Date().toISOString().slice(0, 10)
      link.href = urlObject
      link.download = `我的AI衣橱-备份-${stamp}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(urlObject)
      notify('备份文件已导出')
    } catch (error) {
      notify(error instanceof Error ? error.message : '导出失败', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handleImport(file: File | undefined) {
    if (!file) return
    setBusy(true)
    try {
      const text = await file.text()
      const bundle = JSON.parse(text) as ExportBundle
      if (bundle?.app !== 'my-ai-wardrobe' || !Array.isArray(bundle.garments)) {
        throw new Error('这不是本应用的备份文件')
      }
      const result = await importData(bundle)
      notify(`已导入 ${result.garments} 件衣服、${result.logs} 条洗衣记录`)
    } catch (error) {
      notify(error instanceof Error ? error.message : '导入失败', 'error')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleInstall() {
    const outcome = await install()
    if (outcome === 'unavailable') {
      notify('当前浏览器没有提供安装入口，可用浏览器菜单里的“添加到主屏幕”', 'error')
    } else if (outcome === 'accepted') {
      notify('已添加到桌面')
    }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>设置</h1>
          <p className="sub">云端同步、备份与应用安装</p>
        </div>
        <span className={`pill ${mode === 'cloud' ? 'cloud' : ''}`}>
          {mode === 'cloud' ? '☁️ 云端同步中' : '📱 仅本机'}
        </span>
      </header>

      {/* ---------- 云端同步 ---------- */}
      <section className="panel">
        <h3>☁️ 云端同步（手机和电脑共用一个衣橱）</h3>
        <p className="desc">
          这是<b>家庭共用衣橱</b>：全家人用同一个账号登录，谁添加或修改，其他人刷新就能看到。
          账号已经建好，你只需要输入邮箱和家庭码；家庭码就是登录密码，只发给家人。
        </p>

        {mode === 'cloud' && session ? (
          <div className="stack">
            <div className="row between">
              <span className="note">已登录：{session.user.email ?? '未知邮箱'}</span>
              <span className="pill cloud">共 {garments.length} 件衣服</span>
            </div>
            <div className="row wrap">
              <button className="btn small" onClick={() => void refresh()} disabled={busy}>
                立即同步
              </button>
              <button className="btn small" onClick={() => void handleChangeCode()} disabled={busy}>
                修改家庭码
              </button>
              <button className="btn small" onClick={() => void handleSignOut()} disabled={busy}>
                退出账号
              </button>
              <button className="btn small danger" onClick={() => void handleDisconnect()} disabled={busy}>
                断开云端配置
              </button>
            </div>
            {localCount ? (
              <div className="hint-box">
                <p className="note">
                  这台设备上还存着 {localCount} 件只保存在本机的衣服。要一起上传到云端吗？
                  （上传后手机和电脑就都能看到它们了）
                </p>
                <p className="note" style={{ marginTop: 6 }}>
                  上传前会自动在本机存一份备份；同一个账号不会重复导入；
                  <b>本机数据不会被删除</b>。
                </p>
                <button className="btn small primary" onClick={() => void handleMigrate()} disabled={busy}>
                  上传本机数据到云端
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="stack">
            {config ? (
              <p className="note">已连接家庭云端衣橱（配置已内置，不需要填写）。</p>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="s-url">项目地址</label>
                  <input
                    id="s-url"
                    className="input"
                    value={url}
                    placeholder="https://xxxxx.supabase.co"
                    autoComplete="off"
                    onChange={(e) => setUrl(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="s-key">anon public 密钥</label>
                  <input
                    id="s-key"
                    className="input"
                    value={anonKey}
                    placeholder="eyJhbGciOi..."
                    autoComplete="off"
                    onChange={(e) => setAnonKey(e.target.value)}
                  />
                </div>
                <button className="btn small primary" onClick={() => handleSaveConfig()} disabled={busy}>
                  保存云端配置
                </button>
                <div className="divider" />
              </>
            )}

            {config ? (
              <>
                <div className="field">
                  <label htmlFor="s-email">邮箱（第一次填，之后会记住）</label>
                  <input
                    id="s-email"
                    className="input"
                    type="email"
                    value={email}
                    placeholder="you@example.com"
                    autoComplete="username"
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="s-password">家庭码（就是登录密码）</label>
                  <input
                    id="s-password"
                    className="input"
                    type="password"
                    value={password}
                    placeholder="至少 8 位"
                    autoComplete="current-password"
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div className="row wrap">
                  <button className="btn small primary" onClick={() => void handleSignIn()} disabled={busy}>
                    进入家庭衣橱
                  </button>
                  <button
                    className="btn small ghost"
                    onClick={() => navigate('/reset-password')}
                    disabled={busy}
                  >
                    忘记家庭码？
                  </button>
                </div>
                <p className="note">家庭码只发给家人；登录后可以在上面点「修改家庭码」。</p>
              </>
            ) : null}
          </div>
        )}
      </section>

      {/* ---------- 分享衣橱 ---------- */}
      <section className="panel">
        <h3>🔗 分享衣橱（只读链接）</h3>
        <p className="desc">
          生成一个链接发给别人，对方不用注册、不用装 App，打开就能浏览你的衣橱，但<b>不能修改</b>。
          别人也可以把自己的链接发给你，用同样的方式打开。撤销后链接立刻失效。
        </p>
        {mode === 'cloud' && client && session ? (
          <div className="stack">
            <div className="row between">
              <span className="note">分享会包含当前全部 {garments.length} 件衣服和照片</span>
            </div>
            <button
              className="btn small primary"
              onClick={() => void handleCreateShare()}
              disabled={busy || shareBusy}
            >
              {shareBusy ? shareProgress ?? '正在生成…' : '生成新的分享链接'}
            </button>
            {shares.length ? (
              <div className="share-list">
                {shares.map((item) => (
                  <div key={item.token} className="share-item">
                    <div className="row between">
                      <b>{item.title}</b>
                      <span className="note">
                        {new Date(item.createdAt).toLocaleDateString('zh-CN')} · {item.count} 件
                      </span>
                    </div>
                    <div className="link">{`${window.location.origin}/s/${item.token}`}</div>
                    {confirmRevoke === item.token ? (
                      <>
                        <p className="note">撤销后这个链接立即失效，已上传的分享照片也会删除。</p>
                        <div className="row wrap">
                          <button
                            className="btn small danger"
                            onClick={() => void handleRevokeShare(item.token)}
                            disabled={shareBusy}
                          >
                            {shareBusy ? '正在撤销…' : '确定撤销'}
                          </button>
                          <button
                            className="btn small ghost"
                            onClick={() => setConfirmRevoke(null)}
                            disabled={shareBusy}
                          >
                            取消
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="row wrap">
                        <button className="btn small" onClick={() => void copyShareLink(item.token)}>
                          复制链接
                        </button>
                        <a className="btn small ghost" href={`/s/${item.token}`} target="_blank" rel="noreferrer">
                          预览
                        </a>
                        <button
                          className="btn small danger"
                          onClick={() => setConfirmRevoke(item.token)}
                          disabled={shareBusy}
                        >
                          撤销
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="note">还没有分享链接。生成后可以把链接发到微信或短信里。</p>
            )}
          </div>
        ) : (
          <p className="note">先在上一栏登录云端账号，才能生成分享链接。</p>
        )}
      </section>

      {/* ---------- 数据备份 ---------- */}
      <section className="panel">
        <h3>💾 数据备份</h3>
        <p className="desc">
          导出一个 JSON 文件保存到电脑或网盘，换设备时可以再导入回来。当前共有 {garments.length} 件衣服、{logs.length} 条洗衣记录。
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={includePhotos}
            onChange={(e) => setIncludePhotos(e.target.checked)}
          />
          <span>备份里包含照片（文件会更大）</span>
        </label>
        <div className="row wrap" style={{ marginTop: 10 }}>
          <button className="btn small primary" onClick={() => void handleExport()} disabled={busy}>
            导出备份
          </button>
          <button className="btn small" onClick={() => fileRef.current?.click()} disabled={busy}>
            导入备份
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            void handleImport(e.target.files?.[0])
          }}
        />
      </section>

      {/* ---------- 数据自检 ---------- */}
      <section className="panel">
        <h3>🔍 数据自检</h3>
        {mismatches.length === 0 ? (
          <p className="desc" style={{ margin: '0 0 12px' }}>
            ✅ 全部 {garments.length} 件衣服的编号都和分类对得上，没有需要修复的记录。
          </p>
        ) : (
          <>
            <p className="desc" style={{ margin: '0 0 10px' }}>
              发现 {mismatches.length} 条记录「分类和编号对不上」（多半是早期版本改过分类留下的）。
              它们的编号本身不会重复，但显示起来会怪怪的（比如分类是裤子却写着上衣003）。
            </p>
            <div className="mismatch-list">
              {mismatches.map((item) => (
                <div key={item.id} className="mismatch-row">
                  <span className="code">{item.code}</span>
                  <span className="name">{item.name}</span>
                  <span className="note">应该是「{item.expectedPrefix}xxx」</span>
                </div>
              ))}
            </div>
            <p className="note" style={{ marginTop: 10 }}>
              修复会按「分类里当前最小的空缺编号」给这几件重新编号，
              <b>不会删除任何衣服或照片</b>，但编号会变，所以需要你确认。
            </p>
            <button
              className="btn small"
              onClick={() => {
                const ok = confirm(
                  `确定要重新编号这 ${mismatches.length} 件衣服吗？\n\n` +
                    '只会修改编号文字，照片、名称、洗涤记录都保留。'
                )
                if (ok) notify('这个功能需要手动逐条修改，暂时没有一键修复')
              }}
            >
              了解修复方案
            </button>
          </>
        )}

        <div className="seq-info">
          {sequenceInfo.map((info) => (
            <div key={info.category} className="seq-row">
              <span className="k">
                {CATEGORY_META[info.category].emoji} {CATEGORY_META[info.category].label}
              </span>
              <span className="v">
                已有 {info.used} 件，最大 {info.max ? String(info.max).padStart(3, '0') : '—'}
                ，下一件是 <b>{info.next}</b>
              </span>
            </div>
          ))}
        </div>
        <p className="note" style={{ marginTop: 8 }}>
          规则：三个分类各自独立编号，每次新增都从 001 开始找当前最小的空缺号。
          删掉 003 之后，下一件上衣会重新拿到 003。
        </p>
      </section>

      {/* ---------- 图片显示 ---------- */}
      <section className="panel">
        <h3>🖼️ 图片显示</h3>
        <p className="desc">
          新添加的衣服默认用哪种方式显示图片。<b>只影响新衣服</b>，已经添加的衣服保持各自的设置不变。
        </p>
        <div className="mode-picker compact">
          {IMAGE_MODES.map((item) => {
            const meta = IMAGE_MODE_META[item]
            return (
              <button
                key={item}
                className={`mode-btn ${defaultImageMode === item ? 'on' : ''}`}
                onClick={() => setDefaultImageMode(item)}
              >
                <span className="mode-emoji" aria-hidden>
                  {meta.emoji}
                </span>
                <span className="mode-label">{meta.label}</span>
              </button>
            )
          })}
        </div>

        <div className="sub-head" style={{ marginTop: 18 }}>
          <span>我的自定义图片（{customAssets.length}）</span>
          <button type="button" className="btn small ghost" onClick={() => assetRef.current?.click()}>
            ＋ 上传
          </button>
        </div>
        {customAssets.length ? (
          <div className="asset-grid">
            {customAssets.map((asset) => (
              <div key={asset.id} className="asset-cell">
                <div className="asset-pick static">
                  <CustomAssetThumb photoPath={asset.photoPath} name={asset.name} />
                </div>
                <button
                  type="button"
                  className="asset-del"
                  aria-label={`删除 ${asset.name}`}
                  onClick={() => {
                    if (confirm(`删除自定义图片「${asset.name}」？用它的衣服会回到默认卡通图。`)) {
                      void deleteCustomAsset(asset.id)
                    }
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="note">
            还没有自定义图片。上传后可以在「添加衣服」页选为卡通图片，真实照片不会受影响。
          </p>
        )}
        <input
          ref={assetRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            void handleAssetUpload(e.target.files?.[0])
          }}
        />
      </section>

      {/* ---------- 安装到桌面 ---------- */}
      <section className="panel">
        <h3>📱 添加到手机桌面</h3>
        <p className="desc">
          {standalone
            ? '当前已经是桌面 App 模式打开的，恭喜！'
            : '在安卓 Chrome 里打开后，用浏览器菜单里的「添加到主屏幕 / 安装应用」即可像普通 App 一样全屏使用。'}
        </p>
        {canInstall ? (
          <button className="btn small primary" onClick={() => void handleInstall()}>
            一键添加到桌面
          </button>
        ) : null}
      </section>

      {/* ---------- 关于 ---------- */}
      <section className="panel">
        <h3>ℹ️ 关于</h3>
        <ul className="bullet-list">
          <li>数据默认只保存在这台设备的浏览器里，不会上传到任何地方。</li>
          <li>照片只用于你自己的衣橱，不会被公开发布。</li>
          <li>应用本身没有广告、没有内购、不调用任何付费接口。</li>
          <li>云端同步使用 Supabase 免费套餐，不需要付费。</li>
        </ul>
        <p className="note">版本 1.0.0</p>
      </section>

      {toast ? <Toast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} /> : null}
    </>
  )
}
