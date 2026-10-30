import { useEffect, useState } from 'react'
import { CARTOON_COLORS, cartoonDataUri, listCartoonAssets } from '../lib/cartoon'
import { compressImage } from '../lib/image'
import { savePendingPhoto } from '../lib/pendingPhoto'
import { useWardrobe } from '../store/wardrobe'
import { CATEGORIES, CATEGORY_META, IMAGE_MODES, IMAGE_MODE_META } from '../types'
import type { Category, ImageMode } from '../types'

function AssetThumb({
  photoPath,
  name,
  selected,
  onSelect,
  onDelete
}: {
  photoPath: string
  name: string
  selected: boolean
  onSelect: () => void
  onDelete?: () => void
}) {
  const { photoUrl } = useWardrobe()
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    photoUrl(photoPath).then((url) => {
      if (active) setSrc(url)
    })
    return () => {
      active = false
    }
  }, [photoPath, photoUrl])

  return (
    <div className={`asset-cell ${selected ? 'on' : ''}`}>
      <button type="button" className="asset-pick" onClick={onSelect} title={name}>
        {src ? <img src={src} alt={name} /> : <span className="asset-loading">…</span>}
        {selected ? <span className="asset-check">✓</span> : null}
      </button>
      {onDelete ? (
        <button type="button" className="asset-del" onClick={onDelete} aria-label={`删除 ${name}`}>
          ✕
        </button>
      ) : null}
    </div>
  )
}

export function ImagePicker({
  mode,
  category,
  cartoonId,
  customAssetId,
  photoPreview,
  customPreview,
  busy,
  onModeChange,
  onCartoonChange,
  onCustomAssetChange,
  onPhotoPick,
  onPhotoRemove,
  onCustomFilePick
}: {
  mode: ImageMode
  category: Category
  cartoonId: string | null
  customAssetId: string | null
  photoPreview: string | null
  customPreview: string | null
  busy?: boolean
  onModeChange: (mode: ImageMode) => void
  onCartoonChange: (id: string | null) => void
  onCustomAssetChange: (id: string | null) => void
  onPhotoPick: (file: File) => void
  onPhotoRemove?: () => void
  /** 自定义图片在这里已经压缩过了，传进来的是 Blob */
  onCustomFilePick: (blob: Blob, name: string) => void
}) {
  const { customAssets, deleteCustomAsset } = useWardrobe()
  const [tab, setTab] = useState<Category>(category)
  const [compressing, setCompressing] = useState(false)

  // 衣服分类变了，卡通库的默认分类跟着变
  useEffect(() => {
    setTab(category)
  }, [category])

  const assets = listCartoonAssets(tab)
  const selectedAsset = customAssets.find((asset) => asset.id === customAssetId) ?? null
  const availableModes = category === 'shoes' ? IMAGE_MODES.filter((item) => item !== 'cartoon') : IMAGE_MODES

  // 鞋子暂时没有内置卡通图，如果默认是卡通就切回真实照片
  useEffect(() => {
    if (category === 'shoes' && mode === 'cartoon') onModeChange('photo')
  }, [category, mode, onModeChange])

  async function handleCustomFile(file: File | undefined) {
    if (!file) return
    setCompressing(true)
    try {
      const compressed = await compressImage(file)
      const name = file.name.replace(/\.[^.]+$/, '').slice(0, 20) || '自定义图片'
      onCustomFilePick(compressed, name)
    } finally {
      setCompressing(false)
    }
  }

  return (
    <div className="field">
      <span className="field-label">图片显示方式</span>

      <div className="mode-picker">
        {availableModes.map((item) => {
          const meta = IMAGE_MODE_META[item]
          return (
            <button
              type="button"
              key={item}
              className={`mode-btn ${mode === item ? 'on' : ''}`}
              onClick={() => onModeChange(item)}
            >
              <span className="mode-emoji" aria-hidden>
                {meta.emoji}
              </span>
              <span className="mode-label">{meta.label}</span>
              <span className="mode-hint">{meta.hint}</span>
            </button>
          )
        })}
      </div>
      {category === 'shoes' ? (
        <p className="note">鞋子暂时没有内置卡通图，可以用真实照片，或者选“隐藏图片”。</p>
      ) : null}

      {/* ---------- 真实照片 ---------- */}
      {mode === 'photo' ? (
        <div className="photo-picker">
          <label className="photo-drop" htmlFor={photoPreview ? 'photo-album' : 'photo-camera'}>
            {compressing ? (
              <span className="hint">
                <span className="big">⏳</span>
                正在压缩照片…
              </span>
            ) : photoPreview ? (
              <img src={photoPreview} alt="衣服预览" />
            ) : (
              <span className="hint">
                <span className="big">📷</span>
                点击拍照或从相册选择
              </span>
            )}
          </label>
          <div className="photo-actions">
            <label className="btn small" htmlFor="photo-camera">
              拍照
            </label>
            <label className="btn small" htmlFor="photo-album">
              相册
            </label>
            {photoPreview && onPhotoRemove ? (
              <button type="button" className="btn small ghost" onClick={onPhotoRemove}>
                移除照片
              </button>
            ) : null}
          </div>
          <p className="note">上传后这件衣服就显示你的真实照片，不会再显示卡通图。</p>
        </div>
      ) : null}

      {/* ---------- 卡通图片 ---------- */}
      {mode === 'cartoon' ? (
        <div className="cartoon-picker">
          <div className="sub-head">
            <span>我的自定义图片</span>
            <label className="btn small ghost" htmlFor="custom-image">
              ＋ 上传自定义图片
            </label>
          </div>

          {customPreview ? (
            <div className="custom-preview">
              <img src={customPreview} alt="自定义图片预览" />
              <div className="stack" style={{ gap: 8 }}>
                <span className="note">已选择新上传的自定义图片，保存后生效。</span>
                <button
                  type="button"
                  className="btn small ghost"
                  onClick={() => onCustomAssetChange(null)}
                >
                  取消选择
                </button>
              </div>
            </div>
          ) : null}

          {customAssets.length ? (
            <div className="asset-grid">
              {customAssets.map((asset) => (
                <AssetThumb
                  key={asset.id}
                  photoPath={asset.photoPath}
                  name={asset.name}
                  selected={asset.id === customAssetId}
                  onSelect={() => onCustomAssetChange(asset.id)}
                  onDelete={() => {
                    if (confirm(`删除自定义图片「${asset.name}」？用它的衣服会回到默认卡通图。`)) {
                      void deleteCustomAsset(asset.id)
                      if (customAssetId === asset.id) onCustomAssetChange(null)
                    }
                  }}
                />
              ))}
            </div>
          ) : (
            <p className="note">还没有自定义图片。可以从相册上传一张自己的卡通图。</p>
          )}

          {selectedAsset ? (
            <button type="button" className="btn small ghost" onClick={() => onCustomAssetChange(null)}>
              ↩ 恢复默认卡通图
            </button>
          ) : null}

          <div className="sub-head">
            <span>内置卡通素材库</span>
          </div>
          <div className="chips" role="tablist" aria-label="卡通素材分类">
            {CATEGORIES.filter((item) => item !== 'shoes').map((item) => (
              <button
                type="button"
                key={item}
                role="tab"
                aria-selected={tab === item}
                className={`chip ${tab === item ? 'active' : ''}`}
                onClick={() => setTab(item)}
              >
                {CATEGORY_META[item].emoji} {CATEGORY_META[item].label}
              </button>
            ))}
          </div>

          <div className="cartoon-grid">
            {assets.map((asset) => {
              const uri = cartoonDataUri(asset.id)
              return (
                <button
                  type="button"
                  key={asset.id}
                  className={`cartoon-cell ${cartoonId === asset.id ? 'on' : ''}`}
                  onClick={() => onCartoonChange(asset.id)}
                  title={asset.name}
                >
                  {uri ? <img src={uri} alt={asset.name} /> : null}
                  {cartoonId === asset.id ? <span className="cell-check">✓</span> : null}
                </button>
              )
            })}
          </div>

          <div className="color-legend">
            可选颜色：
            {CARTOON_COLORS.map((color) => (
              <span key={color.id} className="legend-dot" title={color.name}>
                <i style={{ background: color.hex }} />
                {color.name}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* ---------- 隐藏图片 ---------- */}
      {mode === 'hidden' ? (
        <div className="hidden-hint">
          <div className="photo-hidden preview">
            <img
              src={`data:image/svg+xml;utf8,${encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><path d="M50 16a9 9 0 1 1 9 9c-3.5 1.2-6 3.8-6 7v3" fill="none" stroke="#BCB3A2" stroke-width="3.5" stroke-linecap="round"/><path d="M16 76 L50 33 L84 76 Z" fill="none" stroke="#BCB3A2" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/></svg>'
              )}`}
              alt=""
              aria-hidden
            />
          </div>
          <p className="note">
            列表和详情页只显示编号、名称、分类和洗涤状态。
            你上传的真实照片和卡通图设置都会保留，以后随时可以切回来。
          </p>
        </div>
      ) : null}

      <input
        id="photo-camera"
        className="file-input-hidden"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          const input = e.target
          if (file) {
            await savePendingPhoto(file)
            onPhotoPick(file)
          }
          // 微信/鸿蒙上立刻清空 value 可能让 File 失效，等照片处理完再清
          setTimeout(() => {
            input.value = ''
          }, 3000)
        }}
      />
      <input
        id="photo-album"
        className="file-input-hidden"
        type="file"
        accept="image/*"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          const input = e.target
          if (file) {
            await savePendingPhoto(file)
            onPhotoPick(file)
          }
          setTimeout(() => {
            input.value = ''
          }, 3000)
        }}
      />
      <input
        id="custom-image"
        className="file-input-hidden"
        type="file"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0]
          const input = e.target
          if (file) void handleCustomFile(file)
          setTimeout(() => {
            input.value = ''
          }, 3000)
        }}
      />
      {busy ? <span className="note">保存中…</span> : null}
    </div>
  )
}
