import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CategoryChips } from '../components/GarmentCard'
import { StatusBadge } from '../components/StatusBadge'
import { cartoonDataUri } from '../lib/cartoon'
import { fetchShared, sharedPhotoUrl, type SharePayload, type SharedGarment } from '../data/shares'
import { useWardrobe } from '../store/wardrobe'
import { CATEGORY_META, SEASON_META, THICKNESS_META } from '../types'

function ShareThumb({ token, garment }: { token: string; garment: SharedGarment }) {
  const [broken, setBroken] = useState(false)
  const photo = garment.displayMode === 'photo' && garment.hasPhoto ? sharedPhotoUrl(token, garment.id) : null
  const cartoon = garment.displayMode === 'cartoon' ? cartoonDataUri(garment.cartoonId) : null

  if (photo && !broken) {
    return (
      <img
        src={photo}
        alt={garment.name || garment.code}
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
      />
    )
  }
  if (cartoon) return <img src={cartoon} alt="" aria-hidden />
  return (
    <div className="placeholder" aria-hidden>
      <span>{CATEGORY_META[garment.category].emoji}</span>
    </div>
  )
}

export function SharePage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const { mode, garments: myGarments, createGarment } = useWardrobe()
  const [payload, setPayload] = useState<SharePayload | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [active, setActive] = useState<SharedGarment | null>(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState<{ added: number; skipped: number; failed: number } | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    fetchShared(token)
      .then((data) => {
        if (!alive) return
        if (!data) setError('这个分享链接不存在，或者已经被主人撤销了')
        else setPayload(data)
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : '加载失败')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [token])

  const garments = payload?.garments ?? []

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return garments.filter((g) => {
      if (category !== 'all' && g.category !== category) return false
      if (!q) return true
      return (
        g.code.toLowerCase().includes(q) ||
        g.name.toLowerCase().includes(q) ||
        g.color.toLowerCase().includes(q)
      )
    })
  }, [garments, category, query])

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: garments.length }
    for (const g of garments) map[g.category] = (map[g.category] ?? 0) + 1
    return map
  }, [garments])

  const canImport = mode === 'cloud'

  async function runImport(items: SharedGarment[]) {
    if (!canImport) {
      navigate('/settings')
      return
    }
    if (!items.length) return
    setImporting(true)
    setResult(null)
    let added = 0
    let skipped = 0
    let failed = 0
    for (let i = 0; i < items.length; i += 1) {
      const g = items[i]
      setProgress(`正在导入 ${i + 1}/${items.length}`)
      const duplicate =
        Boolean(g.name) &&
        myGarments.some((x) => x.name === g.name && x.color === g.color && x.category === g.category)
      if (duplicate) {
        skipped += 1
        continue
      }
      let photo: Blob | null = null
      if (g.displayMode === 'photo' && g.hasPhoto) {
        const url = sharedPhotoUrl(token, g.id)
        if (url) {
          try {
            const response = await fetch(url)
            if (response.ok) photo = await response.blob()
          } catch {
            // 照片拿不到就只导入文字信息
          }
        }
      }
      try {
        await createGarment({
          category: g.category,
          name: g.name,
          color: g.color,
          seasons: g.seasons,
          thickness: g.thickness,
          notes: '',
          photo,
          displayMode: photo ? 'photo' : g.displayMode === 'cartoon' ? 'cartoon' : 'hidden',
          cartoonId: photo ? null : g.cartoonId,
          customAssetId: null
        })
        added += 1
      } catch {
        failed += 1
      }
    }
    setImporting(false)
    setProgress('')
    setResult({ added, skipped, failed })
    setActive(null)
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <span>正在打开分享的衣橱…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="share-empty">
        <div className="share-empty-icon" aria-hidden>
          🔗
        </div>
        <h1>打不开这个分享</h1>
        <p>{error}</p>
        <p className="note">请让分享链接的主人重新生成一个链接。</p>
      </div>
    )
  }

  return (
    <>
      <header className="page-head share-head">
        <div>
          <h1>{payload?.title || '我的衣橱'}</h1>
          <p className="sub">只读分享 · 共 {garments.length} 件衣服</p>
        </div>
        <span className="pill">👀 只看不改</span>
      </header>

      <div className="share-banner">
        <span>🔗</span>
        <span>这是别人分享给你的衣橱，你可以浏览，也可以把喜欢的衣服导入自己的衣橱。</span>
      </div>

      <div className="share-actions">
        {canImport ? (
          <button
            className="btn primary block"
            disabled={importing || garments.length === 0}
            onClick={() => void runImport(garments)}
          >
            {importing ? progress || '正在导入…' : '＋ 全部导入到我的衣橱'}
          </button>
        ) : (
          <button className="btn block" onClick={() => navigate('/settings')}>
            登录后可以一键导入到我的衣橱
          </button>
        )}
        {result ? (
          <p className="share-result">
            已导入 {result.added} 件
            {result.skipped ? `，跳过 ${result.skipped} 件已有` : ''}
            {result.failed ? `，失败 ${result.failed} 件` : ''}。
            <a href="/wardrobe">去看看我的衣橱 →</a>
          </p>
        ) : (
          <p className="note">导入是复制一份到你的账号，对方的衣橱不会被改动；编号会按你的衣橱自动重新分配。</p>
        )}
      </div>

      <div className="search">
        <span className="glass" aria-hidden>
          🔍
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索编号、名称、颜色"
          aria-label="搜索衣服"
          inputMode="search"
        />
        {query ? (
          <button className="clear" onClick={() => setQuery('')} aria-label="清空搜索">
            ✕
          </button>
        ) : null}
      </div>

      <CategoryChips value={category} onChange={setCategory} counts={counts} />

      {filtered.length === 0 ? (
        <div className="empty">
          <div className="big" aria-hidden>
            🧺
          </div>
          <h3>没有找到衣服</h3>
          <p>换个关键词或分类再试试</p>
        </div>
      ) : (
        <div className="grid">
          {filtered.map((g) => (
            <button
              key={g.id}
              className="card"
              onClick={() => setActive(g)}
              aria-label={`${g.code} ${g.name}`}
            >
              <div className="thumb">
                <ShareThumb token={token} garment={g} />
                <span className="cat-tag">{CATEGORY_META[g.category].label}</span>
              </div>
              <div className="body">
                <span className="code">{g.code}</span>
                <span className="name">{g.name}</span>
                <StatusBadge status={g.washStatus} />
              </div>
            </button>
          ))}
        </div>
      )}

      {active ? (
        <div className="share-overlay" role="dialog" aria-modal="true" onClick={() => setActive(null)}>
          <div className="share-sheet" onClick={(e) => e.stopPropagation()}>
            <button className="share-close" onClick={() => setActive(null)} aria-label="关闭">
              ✕
            </button>
            <div className="share-hero">
              <ShareThumb token={token} garment={active} />
            </div>
            <div className="share-sheet-body">
              <span className="code">{active.code}</span>
              <h2>{active.name || '未命名'}</h2>
              <StatusBadge status={active.washStatus} />
              <dl className="share-facts">
                <div>
                  <dt>分类</dt>
                  <dd>
                    {CATEGORY_META[active.category].emoji} {CATEGORY_META[active.category].label}
                  </dd>
                </div>
                <div>
                  <dt>颜色</dt>
                  <dd>{active.color || '—'}</dd>
                </div>
                <div>
                  <dt>季节</dt>
                  <dd>{active.seasons.length ? active.seasons.map((s) => SEASON_META[s]).join('、') : '—'}</dd>
                </div>
                <div>
                  <dt>厚薄</dt>
                  <dd>{THICKNESS_META[active.thickness]}</dd>
                </div>
              </dl>
              <button
                className="btn small primary"
                disabled={importing}
                onClick={() => {
                  if (active) void runImport([active])
                }}
              >
                导入这一件到我的衣橱
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
