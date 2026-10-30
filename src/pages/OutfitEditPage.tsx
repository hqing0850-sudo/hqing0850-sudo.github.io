import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { GarmentPhoto } from '../components/GarmentPhoto'
import { wardrobeTitle } from '../lib/members'
import { useWardrobe } from '../store/wardrobe'
import type { Garment } from '../types'

function SlotPicker({
  label,
  required,
  category,
  value,
  options,
  onChange
}: {
  label: string
  required: boolean
  category: Garment['category']
  value: string | null
  options: Garment[]
  onChange: (id: string | null) => void
}) {
  const list = options.filter((garment) => garment.category === category)
  return (
    <section className="outfit-slot">
      <div className="outfit-slot-head">
        <h3>
          {label}
          <span className={required ? 'outfit-required' : 'outfit-optional'}>
            {required ? '必选' : '可选'}
          </span>
        </h3>
        {!required && value ? (
          <button type="button" className="btn small ghost" onClick={() => onChange(null)}>
            清除
          </button>
        ) : null}
      </div>
      {list.length === 0 ? (
        <p className="note">当前衣柜还没有{label}，先去「我的衣服」添加一件。</p>
      ) : (
        <div className="outfit-options">
          {list.map((garment) => (
            <button
              type="button"
              key={garment.id}
              className={`outfit-option ${value === garment.id ? 'on' : ''}`}
              onClick={() => onChange(required && value === garment.id ? garment.id : value === garment.id ? null : garment.id)}
            >
              <span className="outfit-option-photo">
                <GarmentPhoto
                  path={garment.photoPath}
                  alt={garment.name || garment.code}
                  mode={garment.displayMode}
                  cartoonId={garment.cartoonId}
                  customAssetId={garment.customAssetId}
                />
              </span>
              <span className="outfit-option-code">{garment.code}</span>
              <span className="outfit-option-name">{garment.name}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

export function OutfitEditPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { outfits, garments, activeMember, members, createOutfit, updateOutfit, deleteOutfit } =
    useWardrobe()
  const editing = Boolean(id)
  const outfit = outfits.find((item) => item.id === id)

  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [topId, setTopId] = useState<string | null>(null)
  const [outerwearId, setOuterwearId] = useState<string | null>(null)
  const [pantsId, setPantsId] = useState<string | null>(null)
  const [shoesId, setShoesId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!outfit) return
    setName(outfit.name)
    setNotes(outfit.notes)
    setTopId(outfit.topId)
    setOuterwearId(outfit.outerwearId)
    setPantsId(outfit.pantsId)
    setShoesId(outfit.shoesId)
  }, [outfit])

  const wardrobeLabel = useMemo(() => {
    if (activeMember === '__all__') return '全部衣柜'
    if (activeMember === '__none__') return '未分类'
    const member = members.find((item) => item.id === activeMember)
    return member ? wardrobeTitle(member.name) : '全部衣柜'
  }, [activeMember, members])

  const scoped = useMemo(() => {
    if (activeMember === '__all__') return garments
    if (activeMember === '__none__') return garments.filter((garment) => !garment.memberId)
    return garments.filter((garment) => garment.memberId === activeMember)
  }, [garments, activeMember])

  // 编辑旧搭配时，已经选中的衣服即使不在当前衣柜里也要显示出来
  const selectedIds = useMemo(
    () => new Set([topId, outerwearId, pantsId, shoesId].filter((value): value is string => Boolean(value))),
    [topId, outerwearId, pantsId, shoesId]
  )
  const options = useMemo(
    () => garments.filter((garment) => scoped.includes(garment) || selectedIds.has(garment.id)),
    [garments, scoped, selectedIds]
  )

  const autoName = useMemo(() => {
    const codes = options
      .filter((garment) => selectedIds.has(garment.id))
      .sort((a, b) => ['top', 'outerwear', 'pants', 'shoes'].indexOf(a.category) - ['top', 'outerwear', 'pants', 'shoes'].indexOf(b.category))
      .map((garment) => garment.code)
    return codes.join(' + ')
  }, [options, selectedIds])

  async function handleSave() {
    if (!topId || !pantsId) {
      setError('上衣和裤子必须各选一件')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const input = { name, notes, topId, outerwearId, pantsId, shoesId }
      if (editing && outfit) {
        await updateOutfit(outfit.id, input)
      } else {
        await createOutfit(input)
      }
      navigate('/outfits')
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存搭配失败')
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!outfit) return
    setBusy(true)
    try {
      await deleteOutfit(outfit.id)
      navigate('/outfits')
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除搭配失败')
      setBusy(false)
      setConfirmDelete(false)
    }
  }

  if (editing && !outfit) {
    return (
      <>
        <header className="page-head">
          <div>
            <h1>搭配不存在</h1>
            <p className="sub">它可能已经被删除了。</p>
          </div>
          <button className="icon-btn" onClick={() => navigate('/outfits')} aria-label="返回">
            ✕
          </button>
        </header>
        <button className="btn primary" onClick={() => navigate('/outfits')}>
          回到搭配列表
        </button>
      </>
    )
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>{editing ? '编辑搭配' : '新建搭配'}</h1>
          <p className="sub">当前衣柜：{wardrobeLabel}</p>
        </div>
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="返回">
          ✕
        </button>
      </header>

      {error ? (
        <p className="note" style={{ color: 'var(--danger)' }} role="alert">
          {error}
        </p>
      ) : null}

      <div className="field">
        <label htmlFor="outfit-name">搭配名称</label>
        <input
          id="outfit-name"
          className="input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={autoName || '留空自动用编号命名'}
          maxLength={40}
        />
        <p className="note">留空会自动用编号，例如：{autoName || '上衣001 + 外套001 + 裤子001'}</p>
      </div>

      <div className="field">
        <label htmlFor="outfit-notes">备注</label>
        <textarea
          id="outfit-notes"
          className="textarea"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="例如：上班穿、见客户、周末"
          rows={3}
        />
      </div>

      <SlotPicker label="上衣" required category="top" value={topId} options={options} onChange={setTopId} />
      <SlotPicker
        label="外套"
        required={false}
        category="outerwear"
        value={outerwearId}
        options={options}
        onChange={setOuterwearId}
      />
      <SlotPicker label="裤子" required category="pants" value={pantsId} options={options} onChange={setPantsId} />
      <SlotPicker
        label="鞋子"
        required={false}
        category="shoes"
        value={shoesId}
        options={options}
        onChange={setShoesId}
      />

      <div className="row" style={{ marginTop: 18 }}>
        <button className="btn primary grow" onClick={() => void handleSave()} disabled={busy}>
          {busy ? '保存中…' : '保存搭配'}
        </button>
      </div>

      {editing ? (
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn danger grow" onClick={() => setConfirmDelete(true)} disabled={busy}>
            删除这套搭配
          </button>
        </div>
      ) : null}

      {confirmDelete ? (
        <div className="sheet-backdrop" onClick={() => setConfirmDelete(false)}>
          <div className="sheet" onClick={(event) => event.stopPropagation()}>
            <h2>删除这套搭配？</h2>
            <p className="sheet-desc">只删除搭配，不会删除里面的衣服。此操作无法撤销。</p>
            <div className="sheet-actions">
              <button className="btn" onClick={() => setConfirmDelete(false)} disabled={busy}>
                否，取消
              </button>
              <button className="btn danger" onClick={() => void handleDelete()} disabled={busy}>
                {busy ? '删除中…' : '删除'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
