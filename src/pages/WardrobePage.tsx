import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CategoryChips, GarmentCard, StatusFilterChips, useFilteredGarments } from '../components/GarmentCard'
import { useWardrobe } from '../store/wardrobe'
import { WardrobeSwitcher } from '../components/WardrobeSwitcher'
import { CATEGORIES } from '../types'

type SortKey = 'newest' | 'code' | 'status'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'newest', label: '最新添加' },
  { key: 'code', label: '按编号' },
  { key: 'status', label: '按状态' }
]

const STATUS_ORDER: Record<string, number> = {
  to_wash: 0,
  washing: 1,
  drying: 2,
  clean: 3,
  stored: 4
}

export function WardrobePage() {
  const { garments, mode, ready, activeMember } = useWardrobe()
  const navigate = useNavigate()
  const [category, setCategory] = useState('all')
  const [status, setStatus] = useState('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('newest')

  const scoped = useMemo(() => {
    if (activeMember === '__all__') return garments
    if (activeMember === '__none__') return garments.filter((g) => !g.member)
    return garments.filter((g) => g.member === activeMember)
  }, [garments, activeMember])

  const filtered = useFilteredGarments(scoped, category, status, query)

  const sorted = useMemo(() => {
    const list = [...filtered]
    if (sort === 'newest') list.sort((a, b) => b.createdAt - a.createdAt)
    if (sort === 'code') list.sort((a, b) => a.code.localeCompare(b.code, 'zh-CN', { numeric: true }))
    if (sort === 'status')
      list.sort((a, b) => (STATUS_ORDER[a.washStatus] ?? 9) - (STATUS_ORDER[b.washStatus] ?? 9))
    return list
  }, [filtered, sort])

  const counts = useMemo(() => {
    const base: Record<string, number> = { all: scoped.length }
    for (const c of CATEGORIES) base[c] = 0
    for (const g of scoped) base[g.category] += 1
    return base
  }, [scoped])

  return (
    <>
      <header className="page-head">
        <div>
          <h1>
            {activeMember === '__all__'
              ? '我的衣服'
              : activeMember === '__none__'
                ? '未分类'
                : `${activeMember}的衣柜`}
          </h1>
          <p className="sub">
            {filtered.length === scoped.length
              ? `共 ${scoped.length} 件`
              : `筛出 ${filtered.length} 件 / 共 ${scoped.length} 件`}
          </p>
        </div>
        <button className="btn small primary" onClick={() => navigate('/add')}>
          ＋ 新增
        </button>
      </header>

      {ready && mode === 'local' ? (
        <div className="login-hint">
          <span>当前显示的是这台手机的本机数据，家人看不到。登录家庭账号后，大家共用同一个衣橱。</span>
          <button className="btn small primary" onClick={() => navigate('/settings')}>
            去登录
          </button>
        </div>
      ) : null}

      <div className="wardrobe-switch-row">
        <WardrobeSwitcher />
        <span className="note">切换后，新增的衣服会自动归到这个衣柜</span>
      </div>

      <div className="search">
        <span className="glass" aria-hidden>
          🔍
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索编号、名称、颜色、备注"
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
      <StatusFilterChips value={status} onChange={setStatus} />

      <div className="sub-tabs" role="tablist" aria-label="排序">
        {SORTS.map((option) => (
          <button
            key={option.key}
            role="tab"
            aria-selected={sort === option.key}
            className={sort === option.key ? 'on' : ''}
            onClick={() => setSort(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {sorted.length === 0 ? (
        <div className="empty">
          <div className="big">{scoped.length === 0 ? '👗' : '🔍'}</div>
          <h3>
            {scoped.length === 0
              ? activeMember === '__all__'
                ? '还没有衣服'
                : '这个衣柜还没有衣服'
              : '没有符合条件的衣服'}
          </h3>
          <p>
            {scoped.length === 0
              ? activeMember === '__all__'
                ? '拍照录入第一件，系统会自动编号。'
                : `点下面添加，会自动归到「${activeMember === '__none__' ? '未分类' : activeMember}」。`
              : '换个筛选条件或关键词试试。'}
          </p>
          {scoped.length === 0 ? (
            <button className="btn primary" onClick={() => navigate('/add')}>
              ＋ 添加衣服
            </button>
          ) : null}
        </div>
      ) : (
        <div className="grid">
          {sorted.map((garment) => (
            <GarmentCard key={garment.id} garment={garment} />
          ))}
        </div>
      )}

      {scoped.length > 0 ? (
        <button className="fab" onClick={() => navigate('/add')} aria-label="添加衣服">
          ＋ 添加衣服
        </button>
      ) : null}
    </>
  )
}
