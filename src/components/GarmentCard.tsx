import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { GarmentPhoto } from '../components/GarmentPhoto'
import { StatusBadge } from '../components/StatusBadge'
import { CATEGORY_META, CATEGORIES, WASH_STATUSES, WASH_STATUS_META } from '../types'
import type { Garment } from '../types'

export function GarmentCard({
  garment,
  onDelete
}: {
  garment: Garment
  /** 传入后卡片右上角会出现删除按钮 */
  onDelete?: (garment: Garment) => void
}) {
  const navigate = useNavigate()
  const open = () => navigate(`/item/${garment.id}`)
  return (
    <div
      className="card"
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          open()
        }
      }}
      aria-label={`${garment.code} ${garment.name}`}
    >
      <div className="thumb">
        <GarmentPhoto
          path={garment.photoPath}
          alt={garment.name}
          mode={garment.displayMode}
          cartoonId={garment.cartoonId}
          customAssetId={garment.customAssetId}
        />
        <span className="cat-tag">{CATEGORY_META[garment.category].label}</span>
        {onDelete ? (
          <button
            className="card-delete"
            aria-label={`删除 ${garment.code}`}
            onClick={(event) => {
              event.stopPropagation()
              onDelete(garment)
            }}
          >
            🗑
          </button>
        ) : null}
      </div>
      <div className="body">
        <span className="code">{garment.code}</span>
        <span className="name">{garment.name}</span>
        {garment.member ? <span className="member-tag">{garment.member}</span> : null}
        <StatusBadge status={garment.washStatus} />
      </div>
    </div>
  )
}

export function CategoryChips({
  value,
  onChange,
  counts
}: {
  value: string
  onChange: (next: string) => void
  counts?: Record<string, number>
}) {
  const options = [
    { key: 'all', label: '全部', emoji: '🧳' },
    ...CATEGORIES.map((c) => ({
      key: c as string,
      label: CATEGORY_META[c].label,
      emoji: CATEGORY_META[c].emoji
    }))
  ]
  return (
    <div className="chips" role="tablist" aria-label="分类筛选">
      {options.map((option) => (
        <button
          key={option.key}
          role="tab"
          aria-selected={value === option.key}
          className={`chip ${value === option.key ? 'active' : ''}`}
          onClick={() => onChange(option.key)}
        >
          <span aria-hidden>{option.emoji}</span>
          {option.label}
          {counts && counts[option.key] !== undefined ? (
            <span className="count">{counts[option.key]}</span>
          ) : null}
        </button>
      ))}
    </div>
  )
}

export function StatusFilterChips({
  value,
  onChange
}: {
  value: string
  onChange: (next: string) => void
}) {
  const options = [
    { key: 'all', label: '全部状态' },
    ...WASH_STATUSES.map((s) => ({ key: s as string, label: WASH_STATUS_META[s].label }))
  ]
  return (
    <div className="chips" aria-label="状态筛选">
      {options.map((option) => (
        <button
          key={option.key}
          className={`chip ${value === option.key ? 'active' : ''}`}
          onClick={() => onChange(option.key)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function useFilteredGarments(
  garments: Garment[],
  category: string,
  status: string,
  query: string
) {
  return useMemo(() => {
    const q = query.trim().toLowerCase()
    return garments.filter((g) => {
      if (category !== 'all' && g.category !== category) return false
      if (status !== 'all' && g.washStatus !== status) return false
      if (!q) return true
      return (
        g.code.toLowerCase().includes(q) ||
        g.name.toLowerCase().includes(q) ||
        g.color.toLowerCase().includes(q) ||
        g.notes.toLowerCase().includes(q)
      )
    })
  }, [garments, category, status, query])
}
