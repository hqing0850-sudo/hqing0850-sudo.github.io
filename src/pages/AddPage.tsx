import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GarmentForm, emptyFormValue, toInput, type GarmentFormValue } from '../components/GarmentForm'
import { Toast } from '../components/Toast'
import { useWardrobe } from '../store/wardrobe'
import { clearPendingPhoto, loadPendingPhoto } from '../lib/pendingPhoto'
import { codeLikeCategory } from '../lib/numbering'

const DRAFT_KEY = 'wardrobe.addDraft'

function loadDraft(): Partial<GarmentFormValue> | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const draft = parsed as Partial<GarmentFormValue>
    // 旧草稿可能把上一件上衣的名称“上衣006”带到了外套里，这里清掉
    if (draft.name && codeLikeCategory(draft.name) && codeLikeCategory(draft.name) !== draft.category) {
      draft.name = ''
    }
    return draft
  } catch {
    return null
  }
}

function saveDraft(value: GarmentFormValue): void {
  try {
    const draft = {
      category: value.category,
      member: value.member,
      name: value.name,
      color: value.color,
      seasons: value.seasons,
      thickness: value.thickness,
      notes: value.notes,
      displayMode: value.displayMode,
      cartoonId: value.cartoonId,
      customAssetId: value.customAssetId
    }
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // 存不进去也不影响填写
  }
}

export function AddPage() {
  const navigate = useNavigate()
  const { members, createGarment, createCustomAsset, defaultImageMode, activeMember, addMember } =
    useWardrobe()
  const [value, setValue] = useState<GarmentFormValue>(() => {
    const base: GarmentFormValue = {
      ...emptyFormValue(defaultImageMode),
      member:
        activeMember === '__all__' || activeMember === '__none__'
          ? ''
          : members.find((m) => m.id === activeMember)?.name ?? ''
    }
    const draft = loadDraft()
    return draft ? { ...base, ...draft } : base
  })
  const [busy, setBusy] = useState(false)
  const [restored, setRestored] = useState(false)
  const [toast, setToast] = useState<{ message: string; tone: 'info' | 'error' } | null>(null)

  // 页面刷新时 members 是异步加载的，加载完后把当前衣柜补成默认归属
  useEffect(() => {
    const activeName = members.find((m) => m.id === activeMember)?.name
    if (!activeName) return
    setValue((prev) => (prev.member ? prev : { ...prev, member: activeName }))
  }, [members, activeMember])
  // 页面被微信/浏览器重启后，把刚才选的照片和填写内容恢复回来
  useEffect(() => {
    let active = true
    void loadPendingPhoto().then((blob) => {
      if (!active || !blob) return
      if (blob.type && !blob.type.startsWith('image/')) {
        void clearPendingPhoto()
        return
      }
      const preview = URL.createObjectURL(blob)
      setValue((prev) => ({
        ...prev,
        photo: blob,
        photoPreview: preview,
        photoChanged: true,
        photoError: null,
        displayMode: 'photo'
      }))
      setRestored(true)
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    saveDraft(value)
  }, [value])

  // 用 ref 记住「正在保存」，防止连点两次保存按钮创建出两件衣服
  const saving = useRef(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (saving.current) return
    saving.current = true
    setBusy(true)
    try {
      // 如果用户新上传了自定义图片，先把素材存起来，再关联到衣服上
      let customAssetId = value.customAssetId
      if (value.customAssetBlob) {
        const asset = await createCustomAsset(value.customAssetName, value.customAssetBlob)
        customAssetId = asset.id
      }

      const input = toInput(value)
      if (input.name && codeLikeCategory(input.name) && codeLikeCategory(input.name) !== input.category) {
        input.name = ''
      }
      const memberName = (input.member ?? '').trim()
      let memberId: string | null = null
      if (memberName) {
        const existing = members.find((m) => m.name === memberName)
        const member = existing ?? (await addMember(memberName))
        memberId = member.id
      }
      const created = await createGarment({ ...input, memberId, member: memberName, customAssetId })
      await clearPendingPhoto()
      sessionStorage.removeItem(DRAFT_KEY)
      navigate(`/item/${created.id}`, { replace: true, state: { created: created.code } })
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : '保存失败，请重试', tone: 'error' })
      setBusy(false)
      saving.current = false
    }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>添加衣服</h1>
          <p className="sub">保存后会自动分配编号，编号不会重复使用</p>
        </div>
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="返回">
          ✕
        </button>
      </header>

      {restored ? (
        <div className="hint-box">
          <p className="note">已恢复刚才选的照片，请继续填写并点「保存到衣橱」。</p>
          <button
            type="button"
            className="btn small ghost"
            onClick={() => {
              void clearPendingPhoto()
              setRestored(false)
              setValue((prev) => ({ ...prev, photo: null, photoPreview: null, photoChanged: true }))
            }}
          >
            不要这张，重新选
          </button>
        </div>
      ) : null}

      <form onSubmit={handleSubmit}>
        <GarmentForm
          value={value}
          onChange={setValue}
          busy={busy}
          submitLabel="保存到衣橱"
          memberOptions={members.map((m) => m.name)}
        />
      </form>

      {toast ? <Toast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} /> : null}
    </>
  )
}
