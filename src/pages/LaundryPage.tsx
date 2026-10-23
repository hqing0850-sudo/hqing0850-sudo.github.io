import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Toast } from '../components/Toast'
import { formatDateTime, formatDate } from '../lib/format'
import { useWardrobe } from '../store/wardrobe'
import { CATEGORY_META, WASH_STATUS_META } from '../types'
import type { WashStatus } from '../types'

const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'clean', label: '洗净' },
  { key: 'to_wash', label: '待洗' },
  { key: 'washing', label: '洗涤中' },
  { key: 'drying', label: '已晾晒' },
  { key: 'stored', label: '已收纳' }
]

function dayKey(ts: number): string {
  const d = new Date(ts)
  const today = new Date()
  const yesterday = new Date(Date.now() - 86_400_000)
  if (d.toDateString() === today.toDateString()) return '今天'
  if (d.toDateString() === yesterday.toDateString()) return '昨天'
  return formatDate(ts)
}

export function LaundryPage() {
  const { logs, clearLogs, garments } = useWardrobe()
  const navigate = useNavigate()
  const [filter, setFilter] = useState('all')
  const [confirmClear, setConfirmClear] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ message: string; tone: 'info' | 'error' } | null>(null)

  const filtered = useMemo(
    () => (filter === 'all' ? logs : logs.filter((log) => log.toStatus === (filter as WashStatus))),
    [logs, filter]
  )

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>()
    for (const log of filtered) {
      const key = dayKey(log.at)
      const list = map.get(key) ?? []
      list.push(log)
      map.set(key, list)
    }
    return [...map.entries()]
  }, [filtered])

  const existingIds = useMemo(() => new Set(garments.map((g) => g.id)), [garments])

  async function handleClear() {
    setBusy(true)
    try {
      await clearLogs()
      setConfirmClear(false)
      setToast({ message: '洗衣记录已清空', tone: 'info' })
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : '清空失败', tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>洗衣记录</h1>
          <p className="sub">共 {logs.length} 条状态变更记录</p>
        </div>
        {logs.length ? (
          <button className="btn small ghost" onClick={() => setConfirmClear(true)}>
            清空
          </button>
        ) : null}
      </header>

      <div className="chips" aria-label="记录筛选">
        {FILTERS.map((option) => (
          <button
            key={option.key}
            className={`chip ${filter === option.key ? 'active' : ''}`}
            onClick={() => setFilter(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <div className="big">🧺</div>
          <h3>{logs.length === 0 ? '还没有洗衣记录' : '这个筛选下没有记录'}</h3>
          <p>
            {logs.length === 0
              ? '在衣服详情页切换洗涤状态，就会自动留下时间记录。'
              : '换个状态看看。'}
          </p>
          <button className="btn primary" onClick={() => navigate('/wardrobe')}>
            去我的衣服
          </button>
        </div>
      ) : (
        grouped.map(([day, items]) => (
          <section key={day}>
            <h2 className="log-group-title">{day}</h2>
            <div className="timeline">
              {items.map((log) => (
                <div className="log-item" key={log.id}>
                  <div className="row1">
                    <span className="code">{log.itemCode}</span>
                    <span className="name">{log.itemName}</span>
                    <span className="note">{CATEGORY_META[log.category]?.label}</span>
                  </div>
                  <div className="flow">
                    {log.fromStatus ? (
                      <>
                        <span>{WASH_STATUS_META[log.fromStatus].label}</span>
                        <span aria-hidden style={{ color: 'var(--ink-3)' }}>
                          →
                        </span>
                      </>
                    ) : null}
                    <span style={{ color: WASH_STATUS_META[log.toStatus].color, fontWeight: 700 }}>
                      {WASH_STATUS_META[log.toStatus].emoji}{' '}
                      {WASH_STATUS_META[log.toStatus].label}
                    </span>
                    {existingIds.has(log.itemId) ? (
                      <button
                        className="btn small ghost"
                        style={{ minHeight: 28, padding: '0 8px', fontSize: 12 }}
                        onClick={() => navigate(`/item/${log.itemId}`)}
                      >
                        查看
                      </button>
                    ) : (
                      <span className="note">（衣服已删除）</span>
                    )}
                  </div>
                  <div className="time">{formatDateTime(log.at)}</div>
                </div>
              ))}
            </div>
          </section>
        ))
      )}

      {confirmClear ? (
        <div className="sheet-backdrop" onClick={() => setConfirmClear(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>清空所有洗衣记录？</h2>
            <p className="sheet-desc">
              衣服本身和它们当前的状态不会受到影响，只是删除历史记录。此操作无法撤销，建议先导出备份。
            </p>
            <div className="sheet-actions">
              <button className="btn" onClick={() => setConfirmClear(false)} disabled={busy}>
                取消
              </button>
              <button className="btn danger" onClick={() => void handleClear()} disabled={busy}>
                {busy ? '清空中…' : '确认清空'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <Toast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} /> : null}
    </>
  )
}
