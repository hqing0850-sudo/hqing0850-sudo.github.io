import { WASH_STATUS_META } from '../types'

export function StatusBadge({ status }: { status: keyof typeof WASH_STATUS_META }) {
  const meta = WASH_STATUS_META[status]
  return (
    <span className="badge" style={{ background: meta.bg, color: meta.color }}>
      <span aria-hidden>{meta.emoji}</span>
      {meta.label}
    </span>
  )
}
