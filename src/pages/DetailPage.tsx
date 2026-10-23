import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { GarmentPhoto } from '../components/GarmentPhoto'
import { GarmentForm, formValueFromGarment, toInput, type GarmentFormValue } from '../components/GarmentForm'
import { StatusBadge } from '../components/StatusBadge'
import { Toast } from '../components/Toast'
import { formatDateTime, daysSince } from '../lib/format'
import { useWardrobe } from '../store/wardrobe'
import {
  CATEGORY_META,
  IMAGE_MODE_META,
  SEASON_META,
  THICKNESS_META,
  WASH_STATUSES,
  WASH_STATUS_META
} from '../types'
import type { GarmentPatch, WashStatus } from '../types'

export function DetailPage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { garments, logs, updateGarment, deleteGarment, setWashStatus, photoUrl, createCustomAsset } =
    useWardrobe()

  const garment = useMemo(() => garments.find((g) => g.id === id), [garments, id])
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [form, setForm] = useState<GarmentFormValue | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ message: string; tone: 'info' | 'error' } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // 用 ref 记住「正在保存」，防止连点两次保存按钮
  const saving = useRef(false)

  const createdCode = (location.state as { created?: string } | null)?.created

  useEffect(() => {
    if (!garment || mode !== 'edit') return
    let active = true
    photoUrl(garment.photoPath).then((url) => {
      if (active) setForm(formValueFromGarment(garment, url))
    })
    return () => {
      active = false
    }
  }, [garment, mode, photoUrl])

  const garmentLogs = useMemo(() => logs.filter((log) => log.itemId === id).slice(0, 12), [logs, id])

  if (!garment) {
    return (
      <div className="empty" style={{ marginTop: 40 }}>
        <div className="big">🫥</div>
        <h3>找不到这件衣服</h3>
        <p>它可能已经被删除了。</p>
        <button className="btn primary" onClick={() => navigate('/wardrobe')}>
          返回衣橱
        </button>
      </div>
    )
  }

  async function changeStatus(status: WashStatus) {
    if (!garment || busy) return
    setBusy(true)
    try {
      await setWashStatus(garment.id, status)
      setToast({ message: `已标记为「${WASH_STATUS_META[status].label}」`, tone: 'info' })
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : '更新失败', tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function saveEdit(event: React.FormEvent) {
    event.preventDefault()
    if (!garment || !form || saving.current) return
    saving.current = true
    setBusy(true)
    try {
      let customAssetId = form.customAssetId
      if (form.customAssetBlob) {
        const asset = await createCustomAsset(form.customAssetName, form.customAssetBlob)
        customAssetId = asset.id
      }
      const input = toInput(form)
      const patch: GarmentPatch = {
        category: input.category,
        name: input.name.trim() || garment.code,
        color: input.color,
        seasons: input.seasons,
        thickness: input.thickness,
        notes: input.notes,
        displayMode: input.displayMode,
        cartoonId: input.cartoonId,
        customAssetId
      }
      await updateGarment(garment.id, patch, form.photoChanged ? form.photo : undefined)
      setMode('view')
      setToast({ message: '修改已保存', tone: 'info' })
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : '保存失败', tone: 'error' })
    } finally {
      setBusy(false)
      saving.current = false
    }
  }

  async function handleDelete() {
    if (!garment) return
    setBusy(true)
    try {
      await deleteGarment(garment.id)
      navigate('/wardrobe', { replace: true })
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : '删除失败', tone: 'error' })
      setBusy(false)
      setConfirmDelete(false)
    }
  }

  const sinceWash = daysSince(garment.lastWashedAt)

  if (mode === 'edit' && form) {
    return (
      <>
        <header className="page-head">
          <div>
            <h1>编辑衣服</h1>
            <p className="sub">{garment.code} · 更换分类会分配新编号</p>
          </div>
          <button className="icon-btn" onClick={() => setMode('view')} aria-label="取消">
            ✕
          </button>
        </header>
        <form onSubmit={saveEdit}>
          <GarmentForm
            value={form}
            onChange={setForm}
            busy={busy}
            submitLabel="保存修改"
            confirmCategoryChange
          />
        </form>
        {toast ? <Toast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} /> : null}
      </>
    )
  }

  return (
    <>
      <header className="page-head">
        <div>
          <button className="btn small ghost" onClick={() => navigate(-1)} style={{ paddingLeft: 0 }}>
            ← 返回
          </button>
        </div>
        <button className="btn small" onClick={() => setMode('edit')}>
          编辑
        </button>
      </header>

      <div className="detail-layout">
        <div className="detail-cover">
          <GarmentPhoto
            path={garment.photoPath}
            alt={garment.name}
            mode={garment.displayMode}
            cartoonId={garment.cartoonId}
            customAssetId={garment.customAssetId}
          />
        </div>

        <div>
          <p className="eyebrow">{garment.code}</p>
          <div className="detail-title">
            <h2>{garment.name}</h2>
            <StatusBadge status={garment.washStatus} />
          </div>
          {createdCode ? (
            <p className="note" style={{ color: 'var(--brand)', fontWeight: 600 }}>
              ✅ 已添加，自动编号 {createdCode}
            </p>
          ) : null}

          <div className="status-actions">
            {WASH_STATUSES.map((status) => {
              const meta = WASH_STATUS_META[status]
              const on = garment.washStatus === status
              return (
                <button
                  key={status}
                  className={on ? 'on' : ''}
                  style={on ? { background: meta.bg, color: meta.color } : undefined}
                  onClick={() => void changeStatus(status)}
                  disabled={busy}
                >
                  <span aria-hidden>{meta.emoji}</span>
                  {meta.label}
                </button>
              )
            })}
          </div>

          <div className="spec-list">
            <div className="spec">
              <span className="k">分类</span>
              <span className="v">
                {CATEGORY_META[garment.category].emoji} {CATEGORY_META[garment.category].label}
              </span>
            </div>
            <div className="spec">
              <span className="k">图片方式</span>
              <span className="v">
                {IMAGE_MODE_META[garment.displayMode].emoji} {IMAGE_MODE_META[garment.displayMode].label}
              </span>
            </div>
            <div className="spec">
              <span className="k">颜色</span>
              <span className="v">{garment.color || '—'}</span>
            </div>
            <div className="spec">
              <span className="k">季节</span>
              <span className="v">
                {garment.seasons.length ? garment.seasons.map((s) => SEASON_META[s]).join(' · ') : '—'}
              </span>
            </div>
            <div className="spec">
              <span className="k">厚薄</span>
              <span className="v">{THICKNESS_META[garment.thickness]}</span>
            </div>
            <div className="spec">
              <span className="k">状态变更</span>
              <span className="v">{formatDateTime(garment.statusChangedAt)}</span>
            </div>
            <div className="spec">
              <span className="k">最近洗净</span>
              <span className="v">
                {formatDateTime(garment.lastWashedAt)}
                {sinceWash !== null ? (
                  <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}> （{sinceWash} 天前）</span>
                ) : null}
              </span>
            </div>
            <div className="spec">
              <span className="k">录入时间</span>
              <span className="v">{formatDateTime(garment.createdAt)}</span>
            </div>
            {garment.notes ? (
              <div className="spec">
                <span className="k">备注</span>
                <span className="v" style={{ whiteSpace: 'pre-wrap', maxWidth: '65%' }}>
                  {garment.notes}
                </span>
              </div>
            ) : null}
          </div>

          {garmentLogs.length ? (
            <div style={{ marginTop: 22 }}>
              <h3 style={{ fontSize: 15, marginBottom: 12 }}>这件衣服的记录</h3>
              <div className="timeline">
                {garmentLogs.map((log) => (
                  <div className="log-item" key={log.id}>
                    <div className="flow">
                      {log.fromStatus ? WASH_STATUS_META[log.fromStatus].label : '新增'} →{' '}
                      <strong>{WASH_STATUS_META[log.toStatus].label}</strong>
                    </div>
                    <div className="time">{formatDateTime(log.at)}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="row" style={{ marginTop: 24 }}>
            <button className="btn danger grow" onClick={() => setConfirmDelete(true)}>
              删除这件衣服
            </button>
          </div>
        </div>
      </div>

      {confirmDelete ? (
        <div className="sheet-backdrop" onClick={() => setConfirmDelete(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>删除 {garment.code}？</h2>
            <p className="sheet-desc">
              删除后照片和洗涤记录会一起移除，编号 {garment.code} 会被永久作废、以后不会再分配给别人。
              此操作无法撤销。
            </p>
            <div className="sheet-actions">
              <button className="btn" onClick={() => setConfirmDelete(false)} disabled={busy}>
                取消
              </button>
              <button className="btn danger" onClick={() => void handleDelete()} disabled={busy}>
                {busy ? '删除中…' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <Toast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} /> : null}
    </>
  )
}
