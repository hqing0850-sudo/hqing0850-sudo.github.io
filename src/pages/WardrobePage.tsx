import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CategoryChips, GarmentCard, StatusFilterChips, useFilteredGarments } from '../components/GarmentCard'
import { useWardrobe } from '../store/wardrobe'
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
  const { garments } = useWardrobe()
  const navigate = useNavigate()
  const [category, setCategory] = useState('all')
  const [status, setStatus] = useState('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('newest')

  const filtered = useFilteredGarments(garments, category, status, query)

  const sorted = useMemo(() => {
    const list = [...filtered]
    if (sort === 'newest') list.sort((a, b) => b.createdAt - a.createdAt)
    if (sort === 'code') list.sort((a, b) => a.code.localeCompare(b.code, 'zh-CN', { numeric: true }))
    if (sort === 'status')
      list.sort((a, b) => (STATUS_ORDER[a.washStatus] ?? 9) - (STATUS_ORDER[b.washStatus] ?? 9))
    return list
  }, [filtered, sort])

  const counts = useMemo(() => {
    const base: Record<string, number> = { all: garments.length }
    for (const c of CATEGORIES) base[c] = 0
    for (const g of garments) base[g.category] += 1
    return base
  }, [garments])

  return (
    <>
      <header className="page-head">
        <div>
          <h1>我的衣服</h1>
          <p className="sub">
            {filtered.length === garments.length
              ? `共 ${garments.length} 件`
              : `筛出 ${filtered.length} 件 / 共 ${garments.length} 件`}
          </p>
        </div>
        <button className="btn small primary" onClick={() => navigate('/add')}>
          ＋ 新增
        </button>
      </header>

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
          <div className="big">{garments.length === 0 ? '👗' : '🔍'}</div>
          <h3>{garments.length === 0 ? '还没有衣服' : '没有符合条件的衣服'}</h3>
          <p>{garments.length === 0 ? '拍照录入第一件，系统会自动编号。' : '换个筛选条件或关键词试试。'}</p>
          {garments.length === 0 ? (
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

      <button className="fab" onClick={() => navigate('/add')} aria-label="添加衣服">
        ＋ 添加衣服
      </button>
    </>
  )
}
