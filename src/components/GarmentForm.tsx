import { useEffect, useState } from 'react'
import { ImagePicker } from './ImagePicker'
import { compressImage } from '../lib/image'
import {
  CATEGORIES,
  CATEGORY_META,
  SEASONS,
  SEASON_META,
  THICKNESSES,
  THICKNESS_META
} from '../types'
import type { Category, Garment, ImageMode, NewGarmentInput, Season, Thickness } from '../types'
import { DEFAULT_MEMBERS } from '../lib/members'

export interface GarmentFormValue {
  category: Category
  member: string
  name: string
  color: string
  seasons: Season[]
  thickness: Thickness
  notes: string
  /** 真实照片 */
  photo: Blob | null
  photoPreview: string | null
  photoChanged: boolean
  photoError: string | null
  /** 显示方式 */
  displayMode: ImageMode
  cartoonId: string | null
  customAssetId: string | null
  /** 这次保存时要新建的自定义素材 */
  customAssetBlob: Blob | null
  customAssetName: string
  customAssetPreview: string | null
}

export function emptyFormValue(defaultMode: ImageMode = 'cartoon'): GarmentFormValue {
  return {
    category: 'top',
    member: '',
    name: '',
    color: '',
    seasons: [],
    thickness: 'medium',
    notes: '',
    photo: null,
    photoPreview: null,
    photoChanged: false,
    photoError: null,
    displayMode: defaultMode,
    cartoonId: null,
    customAssetId: null,
    customAssetBlob: null,
    customAssetName: '',
    customAssetPreview: null
  }
}

export function formValueFromGarment(garment: Garment, preview: string | null): GarmentFormValue {
  return {
    category: garment.category,
    member: garment.member,
    name: garment.name,
    color: garment.color,
    seasons: garment.seasons,
    thickness: garment.thickness,
    notes: garment.notes,
    photo: null,
    photoPreview: preview,
    photoChanged: false,
    photoError: null,
    displayMode: garment.displayMode,
    cartoonId: garment.cartoonId,
    customAssetId: garment.customAssetId,
    customAssetBlob: null,
    customAssetName: '',
    customAssetPreview: null
  }
}

export function toInput(value: GarmentFormValue): NewGarmentInput {
  return {
    category: value.category,
    member: value.member,
    name: value.name,
    color: value.color,
    seasons: value.seasons,
    thickness: value.thickness,
    notes: value.notes,
    photo: value.photo,
    displayMode: value.displayMode,
    cartoonId: value.cartoonId,
    customAssetId: value.customAssetId
  }
}

export function GarmentForm({
  value,
  onChange,
  busy,
  submitLabel,
  confirmCategoryChange = false,
  memberOptions = DEFAULT_MEMBERS
}: {
  value: GarmentFormValue
  onChange: (next: GarmentFormValue) => void
  busy: boolean
  submitLabel: string
  /** 编辑已有衣服时，换分类会重新分配编号，需要确认 */
  confirmCategoryChange?: boolean
  /** 可选的归属名单（爸爸/妈妈/我…） */
  memberOptions?: string[]
}) {
  const [compressing, setCompressing] = useState(false)

  const patch = (next: Partial<GarmentFormValue>) => onChange({ ...value, ...next })

  async function handlePhoto(file: File | undefined) {
    if (!file) return
    setCompressing(true)
    try {
      const compressed = await compressImage(file)
      const preview = URL.createObjectURL(compressed)
      // 只要上传了真实照片，就默认显示真实照片，不会再显示卡通图
      patch({
        photo: compressed,
        photoPreview: preview,
        photoChanged: true,
        photoError: null,
        displayMode: 'photo'
      })
    } catch {
      // 有些手机（尤其微信/鸿蒙）能选图但压缩失败；先退回原图预览，至少能保存
      const preview = URL.createObjectURL(file)
      const readable = await new Promise<boolean>((resolve) => {
        const probe = new Image()
        probe.onload = () => resolve(true)
        probe.onerror = () => resolve(false)
        probe.src = preview
      })
      if (readable) {
        patch({
          photo: file,
          photoPreview: preview,
          photoChanged: true,
          photoError: null,
          displayMode: 'photo'
        })
      } else {
        URL.revokeObjectURL(preview)
        patch({ photoError: '这张照片手机读不出来，请换一张 JPG 格式的照片' })
      }
    } finally {
      setCompressing(false)
    }
  }

  async function handleCustomFile(blob: Blob, name: string) {
    setCompressing(true)
    try {
      const preview = URL.createObjectURL(blob)
      patch({
        customAssetBlob: blob,
        customAssetName: name,
        customAssetPreview: preview,
        displayMode: 'cartoon'
      })
    } finally {
      setCompressing(false)
    }
  }

  // 清理临时预览
  useEffect(() => {
    return () => {
      if (value.photoPreview?.startsWith('blob:')) URL.revokeObjectURL(value.photoPreview)
    }
  }, [value.photoPreview])

  useEffect(() => {
    return () => {
      if (value.customAssetPreview?.startsWith('blob:')) URL.revokeObjectURL(value.customAssetPreview)
    }
  }, [value.customAssetPreview])

  function toggleSeason(season: Season) {
    const has = value.seasons.includes(season)
    patch({ seasons: has ? value.seasons.filter((s) => s !== season) : [...value.seasons, season] })
  }

  function changeCategory(category: Category) {
    if (category === value.category) return
    if (
      confirmCategoryChange &&
      !confirm(`把分类改成「${CATEGORY_META[category].label}」？\n\n编号会重新分配一个从没用过的新编号，旧编号就此作废。`)
    ) {
      return
    }
    patch({ category })
  }

  // 注意：这里不能再套一层 <form>，否则保存按钮会提交内层表单，
  // 外层页面的提交处理不会被触发。提交交给父级 form 负责。
  return (
    <div className="garment-form">
      {compressing ? <p className="note">正在处理照片，请稍等…</p> : null}
      {value.photoError ? (
        <p className="note" style={{ color: 'var(--danger)' }} role="alert">
          {value.photoError}
        </p>
      ) : null}

      <ImagePicker
        mode={value.displayMode}
        category={value.category}
        cartoonId={value.cartoonId}
        customAssetId={value.customAssetId}
        photoPreview={value.photoPreview}
        customPreview={value.customAssetPreview}
        busy={busy}
        onModeChange={(displayMode) => patch({ displayMode })}
        onCartoonChange={(cartoonId) => patch({ cartoonId, displayMode: 'cartoon' })}
        onCustomAssetChange={(customAssetId) => patch({ customAssetId, displayMode: 'cartoon' })}
        onPhotoPick={(file) => void handlePhoto(file)}
        onPhotoRemove={() => patch({ photo: null, photoPreview: null, photoChanged: true })}
        onCustomFilePick={(blob, name) => void handleCustomFile(blob, name)}
      />

      <div className="field">
        <span className="field-label">分类</span>
        <div className="segmented">
          {CATEGORIES.map((category) => (
            <button
              type="button"
              key={category}
              className={value.category === category ? 'on' : ''}
              onClick={() => changeCategory(category)}
            >
              {CATEGORY_META[category].emoji} {CATEGORY_META[category].label}
            </button>
          ))}
        </div>
        {confirmCategoryChange ? (
          <p className="note">更换分类会分配一个从没用过的新编号，旧编号作废。</p>
        ) : null}
      </div>

      <div className="field">
        <label htmlFor="g-member">归属（谁的衣柜）</label>
        <div className="toggle-row">
          {memberOptions.map((name) => (
            <button
              type="button"
              key={name}
              className={`toggle-chip ${value.member === name ? 'on' : ''}`}
              onClick={() => patch({ member: name })}
            >
              {name}
            </button>
          ))}
          <button
            type="button"
            className={`toggle-chip ${value.member ? '' : 'on'}`}
            onClick={() => patch({ member: '' })}
          >
            未分类
          </button>
        </div>
        <input
          id="g-member"
          className="input"
          value={value.member}
          maxLength={12}
          placeholder="点上面的名字，或直接输入自定义名称"
          onChange={(e) => patch({ member: e.target.value })}
        />
      </div>

      <div className="field">
        <label htmlFor="g-name">名称</label>
        <input
          id="g-name"
          className="input"
          value={value.name}
          maxLength={40}
          placeholder="例如：米白色针织衫（留空则使用编号）"
          onChange={(e) => patch({ name: e.target.value })}
        />
      </div>

      <div className="field">
        <label htmlFor="g-color">颜色</label>
        <input
          id="g-color"
          className="input"
          value={value.color}
          maxLength={20}
          placeholder="例如：米白、藏蓝、格纹"
          onChange={(e) => patch({ color: e.target.value })}
        />
      </div>

      <div className="field">
        <span className="field-label">适合季节（可多选）</span>
        <div className="toggle-row">
          {SEASONS.map((season) => (
            <button
              type="button"
              key={season}
              className={`toggle-chip ${value.seasons.includes(season) ? 'on' : ''}`}
              onClick={() => toggleSeason(season)}
            >
              {SEASON_META[season]}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field-label">厚薄程度</span>
        <div className="segmented">
          {THICKNESSES.map((thickness) => (
            <button
              type="button"
              key={thickness}
              className={value.thickness === thickness ? 'on' : ''}
              onClick={() => patch({ thickness })}
            >
              {THICKNESS_META[thickness]}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="g-notes">备注</label>
        <textarea
          id="g-notes"
          className="textarea"
          value={value.notes}
          maxLength={300}
          placeholder="穿着场合、搭配建议、尺码等"
          onChange={(e) => patch({ notes: e.target.value })}
        />
      </div>

      <button type="submit" className="btn primary block" disabled={busy || compressing}>
        {busy ? '保存中…' : submitLabel}
      </button>
    </div>
  )
}
