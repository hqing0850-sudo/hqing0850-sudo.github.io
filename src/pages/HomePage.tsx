import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GarmentCard } from '../components/GarmentCard'
import { WardrobeSwitcher } from '../components/WardrobeSwitcher'
import { wardrobeTitle } from '../lib/members'
import { useWardrobe } from '../store/wardrobe'
import { CATEGORIES, CATEGORY_META, WASH_STATUS_META } from '../types'
import { relativeTime } from '../lib/format'

export function HomePage() {
  const { garments, logs, mode, activeMember, members } = useWardrobe()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<string>('all')

  const scoped = useMemo(() => {
    if (activeMember === '__all__') return garments
    if (activeMember === '__none__') return garments.filter((g) => !g.memberId)
    return garments.filter((g) => g.memberId === activeMember)
  }, [garments, activeMember])

  const stats = useMemo(() => {
    const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<string, number>
    let toWash = 0
    let dirty = 0
    for (const g of scoped) {
      byCategory[g.category] += 1
      if (g.washStatus === 'to_wash') toWash += 1
      if (g.washStatus === 'to_wash' || g.washStatus === 'washing') dirty += 1
    }
    return { total: scoped.length, byCategory, toWash, dirty }
  }, [scoped])

  const recent = useMemo(() => {
    const sorted = [...scoped].sort((a, b) => b.createdAt - a.createdAt)
    if (filter === 'all') return sorted.slice(0, 8)
    return sorted.filter((g) => g.category === filter).slice(0, 8)
  }, [scoped, filter])

  const laundryQueue = useMemo(
    () =>
      scoped
        .filter((g) => g.washStatus === 'to_wash' || g.washStatus === 'washing')
        .sort((a, b) => a.statusChangedAt - b.statusChangedAt)
        .slice(0, 4),
    [scoped]
  )

  const lastLog = useMemo(() => {
    const ids = new Set(scoped.map((g) => g.id))
    return logs.find((log) => ids.has(log.itemId))
  }, [logs, scoped])

  return (
    <>
      <header className="hero">
        <div>
          <p className="eyebrow">我的 AI 衣橱</p>
          <h1>
            {activeMember === '__all__'
              ? '衣橱概览'
              : activeMember === '__none__'
                ? '未分类的衣服'
                : wardrobeTitle(members.find((m) => m.id === activeMember)?.name ?? '全部')}
          </h1>
          <p className="sub">
            共 {stats.total} 件衣服 · {mode === 'cloud' ? '已同步到云端' : '保存在本机'}
          </p>
        </div>
        <WardrobeSwitcher variant="hero" />
      </header>

      <div className="stat-row">
        <div className="stat accent">
          <div className="n">{stats.total}</div>
          <div className="k">衣服总数</div>
        </div>
        <div className="stat">
          <div className="n">{stats.byCategory.top}</div>
          <div className="k">{CATEGORY_META.top.emoji} 上衣</div>
        </div>
        <div className="stat">
          <div className="n">{stats.byCategory.outerwear}</div>
          <div className="k">{CATEGORY_META.outerwear.emoji} 外套</div>
        </div>
        <div className="stat">
          <div className="n">{stats.byCategory.pants}</div>
          <div className="k">{CATEGORY_META.pants.emoji} 裤子</div>
        </div>
        <div className="stat">
          <div className="n">{stats.byCategory.shoes}</div>
          <div className="k">{CATEGORY_META.shoes.emoji} 鞋子</div>
        </div>
      </div>

      {stats.dirty > 0 ? (
        <div className="panel" style={{ background: 'linear-gradient(165deg,#fbf0e6,#f8e8da)', borderColor: '#ecd5c2' }}>
          <div className="row between" style={{ alignItems: 'flex-start' }}>
            <div>
              <h3 style={{ fontSize: 15.5 }}>该洗衣服了</h3>
              <p className="desc" style={{ margin: '4px 0 0' }}>
                有 {stats.toWash} 件待洗
                {stats.dirty > stats.toWash ? `、${stats.dirty - stats.toWash} 件正在洗` : ''}，别让它们堆太久。
              </p>
            </div>
            <span className="pill warn">🧺 {stats.dirty}</span>
          </div>
          <div className="stack" style={{ marginTop: 12 }}>
            {laundryQueue.map((g) => (
              <button
                key={g.id}
                className="row between"
                style={{ textAlign: 'left', padding: '8px 0' }}
                onClick={() => navigate(`/item/${g.id}`)}
              >
                <span className="row" style={{ gap: 8, minWidth: 0 }}>
                  <span className="code" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                    {g.code}
                  </span>
                  <span
                    style={{
                      fontWeight: 600,
                      fontSize: 14,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {g.name}
                  </span>
                </span>
                <span className="note">{WASH_STATUS_META[g.washStatus].label} · {relativeTime(g.statusChangedAt)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {scoped.length === 0 ? (
        <div className="empty">
          <div className="big">🧺</div>
          <h3>{activeMember === '__all__' ? '衣橱还是空的' : '这个衣柜还是空的'}</h3>
          <p>
            {activeMember === '__all__'
              ? '拍下第一件衣服，它会自动获得一个编号。'
              : `点下面添加，衣服会自动归到「${activeMember === '__none__' ? '未分类' : members.find((m) => m.id === activeMember)?.name ?? '当前衣柜'}」。`}
          </p>
          <button className="btn primary" onClick={() => navigate('/add')}>
            ＋ 添加第一件衣服
          </button>
        </div>
      ) : (
        <>
          <div className="row between" style={{ marginBottom: 12 }}>
            <h2 style={{ fontSize: 17 }}>最近添加</h2>
            <button className="btn small ghost" onClick={() => navigate('/wardrobe')}>
              查看全部 →
            </button>
          </div>

          <div className="chips" aria-label="首页分类筛选">
            <button className={`chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
              全部
            </button>
            {CATEGORIES.map((category) => (
              <button
                key={category}
                className={`chip ${filter === category ? 'active' : ''}`}
                onClick={() => setFilter(category)}
              >
                {CATEGORY_META[category].emoji} {CATEGORY_META[category].label}
              </button>
            ))}
          </div>

          {recent.length === 0 ? (
            <p className="note" style={{ padding: '20px 4px' }}>
              这个分类还没有衣服。
            </p>
          ) : (
            <div className="grid">
              {recent.map((garment) => (
                <GarmentCard key={garment.id} garment={garment} />
              ))}
            </div>
          )}

          {lastLog ? (
            <div className="panel" style={{ marginTop: 20 }}>
              <div className="row between">
                <h3 style={{ fontSize: 15 }}>最近一次洗涤</h3>
                <button className="btn small ghost" onClick={() => navigate('/laundry')}>
                  全部记录
                </button>
              </div>
              <p className="desc" style={{ margin: '6px 0 0' }}>
                {lastLog.itemCode} · {lastLog.itemName} ·{' '}
                {WASH_STATUS_META[lastLog.toStatus].label} · {relativeTime(lastLog.at)}
              </p>
            </div>
          ) : null}
        </>
      )}

      <button className="fab" onClick={() => navigate('/add')} aria-label="添加衣服">
        ＋ 添加衣服
      </button>
    </>
  )
}
