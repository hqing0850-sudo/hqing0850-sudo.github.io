import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GarmentForm, emptyFormValue, toInput, type GarmentFormValue } from '../components/GarmentForm'
import { Toast } from '../components/Toast'
import { useWardrobe } from '../store/wardrobe'
import { allMembers, rememberMember } from '../lib/members'

export function AddPage() {
  const navigate = useNavigate()
  const { garments, createGarment, createCustomAsset, defaultImageMode } = useWardrobe()
  const [value, setValue] = useState<GarmentFormValue>(() => emptyFormValue(defaultImageMode))
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ message: string; tone: 'info' | 'error' } | null>(null)
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
      rememberMember(input.member ?? '')
      const created = await createGarment({ ...input, customAssetId })
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

      <form onSubmit={handleSubmit}>
        <GarmentForm
          value={value}
          onChange={setValue}
          busy={busy}
          submitLabel="保存到衣橱"
          memberOptions={allMembers(garments)}
        />
      </form>

      {toast ? <Toast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} /> : null}
    </>
  )
}
