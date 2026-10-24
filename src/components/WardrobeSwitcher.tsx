import { useMemo, useState } from 'react'
import { useWardrobe } from '../store/wardrobe'
import type { Member } from '../types'

const ALL = '__all__'
const NONE = '__none__'

/** 衣柜切换器：首页点绿色「衣」图标、衣服页点胶囊按钮都会打开 */
export function WardrobeSwitcher({ variant = 'pill' }: { variant?: 'pill' | 'hero' }) {
  const { garments, members, activeMember, setActiveMember, addMember, renameMember, deleteMember } =
    useWardrobe()
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null)
  const [typedName, setTypedName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const counts = useMemo(() => {
    const map: Record<string, number> = { [ALL]: garments.length, [NONE]: 0 }
    for (const g of garments) {
      if (g.memberId) map[g.memberId] = (map[g.memberId] ?? 0) + 1
      else map[NONE] += 1
    }
    return map
  }, [garments])

  const active = members.find((m) => m.id === activeMember)
  const shortLabel = activeMember === ALL ? '全部' : activeMember === NONE ? '未分类' : active?.name ?? '全部'
  const fullLabel =
    activeMember === ALL ? '全部衣柜' : activeMember === NONE ? '未分类' : `${active?.name ?? '全部'}的衣柜`

  function reset() {
    setEditingId(null)
    setDeleteTarget(null)
    setTypedName('')
    setError('')
    setNewName('')
  }

  function close() {
    if (busy) return
    setOpen(false)
    reset()
  }

  function choose(id: string) {
    setActiveMember(id)
    close()
  }

  async function handleCreate() {
    const name = newName.trim()
    if (!name) return
    setBusy(true)
    setError('')
    try {
      await addMember(name)
      setNewName('')
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : '新建失败')
    } finally {
      setBusy(false)
    }
  }

  async function saveRename() {
    if (!editingId) return
    setBusy(true)
    setError('')
    try {
      await renameMember(editingId, editName)
      setEditingId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '改名失败')
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const count = counts[deleteTarget.id] ?? 0
    setBusy(true)
    setError('')
    try {
      await deleteMember(deleteTarget.id, count > 0)
      setDeleteTarget(null)
      setTypedName('')
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    } finally {
      setBusy(false)
    }
  }

  const targetCount = deleteTarget ? counts[deleteTarget.id] ?? 0 : 0

  return (
    <>
      {variant === 'hero' ? (
        <div className="hero-switch">
          <button className="hero-mark" onClick={() => setOpen(true)} aria-label="切换衣柜">
            衣
          </button>
          <span className="hero-switch-label">{shortLabel} ▾</span>
        </div>
      ) : (
        <button className="btn small ghost wardrobe-switch" onClick={() => setOpen(true)}>
          🗄️ {fullLabel} ▾
        </button>
      )}

      {open ? (
        <div className="share-overlay" role="dialog" aria-modal="true" onClick={close}>
          <div className="share-sheet switcher-sheet" onClick={(e) => e.stopPropagation()}>
            <button className="share-close" onClick={close} aria-label="关闭">
              ✕
            </button>
            <div className="switcher-body">
              <h2>切换衣柜</h2>
              <p className="note">切换后，新增和修改都会作用在这个衣柜里，别人也能看到。</p>

              <button
                className={`switch-option ${activeMember === ALL ? 'on' : ''}`}
                onClick={() => choose(ALL)}
              >
                <span>👨‍👩‍👧 全部衣柜</span>
                <span className="switch-count">{counts[ALL]}</span>
              </button>

              {members.map((member) =>
                editingId === member.id ? (
                  <div key={member.id} className="switch-edit">
                    <input
                      className="input"
                      value={editName}
                      maxLength={12}
                      autoFocus
                      onChange={(e) => setEditName(e.target.value)}
                    />
                    <div className="switch-edit-actions">
                      <button className="btn small primary" onClick={() => void saveRename()} disabled={busy}>
                        保存
                      </button>
                      <button
                        className="btn small"
                        onClick={() => {
                          setEditingId(null)
                          setError('')
                        }}
                        disabled={busy}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <div key={member.id} className="switch-item">
                    <button
                      className={`switch-option ${activeMember === member.id ? 'on' : ''}`}
                      onClick={() => choose(member.id)}
                    >
                      <span>{member.name}的衣柜</span>
                      <span className="switch-count">{counts[member.id] ?? 0}</span>
                    </button>
                    <div className="switch-row-actions">
                      <button
                        onClick={() => {
                          setEditingId(member.id)
                          setEditName(member.name)
                          setError('')
                        }}
                      >
                        改名
                      </button>
                      <button
                        className="danger-text"
                        onClick={() => {
                          setDeleteTarget(member)
                          setTypedName('')
                          setError('')
                        }}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                )
              )}

              {counts[NONE] ? (
                <button
                  className={`switch-option ${activeMember === NONE ? 'on' : ''}`}
                  onClick={() => choose(NONE)}
                >
                  <span>未分类</span>
                  <span className="switch-count">{counts[NONE]}</span>
                </button>
              ) : null}

              {error && !deleteTarget ? <p className="switcher-error">{error}</p> : null}

              <div className="switcher-new">
                <input
                  className="input"
                  value={newName}
                  maxLength={12}
                  placeholder="新建衣柜，例如：宝宝"
                  onChange={(e) => setNewName(e.target.value)}
                />
                <button className="btn small primary" disabled={!newName.trim() || busy} onClick={() => void handleCreate()}>
                  新建
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div
          className="share-overlay"
          style={{ zIndex: 80 }}
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (!busy) setDeleteTarget(null)
          }}
        >
          <div className="share-sheet confirm-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-body">
              <h2>删除「{deleteTarget.name}」？</h2>
              {targetCount > 0 ? (
                <>
                  <p className="note">
                    这个衣柜里有 <b>{targetCount}</b> 件衣服，会一起删除，照片也会删掉；
                    <b>洗衣记录会保留</b>。
                  </p>
                  <p className="note">
                    请输入衣柜名字 <b>{deleteTarget.name}</b> 确认：
                  </p>
                  <input
                    className="input"
                    value={typedName}
                    placeholder={deleteTarget.name}
                    onChange={(e) => setTypedName(e.target.value)}
                  />
                </>
              ) : (
                <p className="note">这个衣柜是空的，删除后不能恢复。</p>
              )}
              {error ? <p className="note" style={{ color: 'var(--danger)' }}>{error}</p> : null}
              <div className="confirm-actions">
                <button className="btn" onClick={() => setDeleteTarget(null)} disabled={busy}>
                  否，取消
                </button>
                <button
                  className="btn danger"
                  onClick={() => void confirmDelete()}
                  disabled={busy || (targetCount > 0 && typedName.trim() !== deleteTarget.name)}
                >
                  {busy ? '删除中…' : '是，删除'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
