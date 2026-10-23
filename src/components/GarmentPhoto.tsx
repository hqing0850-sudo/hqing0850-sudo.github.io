import { useEffect, useState } from 'react'
import { cartoonDataUri } from '../lib/cartoon'
import { useWardrobe } from '../store/wardrobe'
import type { ImageMode } from '../types'

/** 隐藏图片时显示的简洁衣架图标 */
const HANGER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
<path d="M50 16a9 9 0 1 1 9 9c-3.5 1.2-6 3.8-6 7v3" fill="none" stroke="#BCB3A2" stroke-width="3.5" stroke-linecap="round"/>
<path d="M16 76 L50 33 L84 76 Z" fill="none" stroke="#BCB3A2" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>
</svg>`

const hangerDataUri = `data:image/svg+xml;utf8,${encodeURIComponent(HANGER_SVG)}`

export function GarmentPhoto({
  path,
  alt,
  className,
  mode = 'photo',
  cartoonId = null,
  customAssetId = null
}: {
  path: string | null
  alt: string
  className?: string
  mode?: ImageMode
  cartoonId?: string | null
  customAssetId?: string | null
}) {
  const { photoUrl, customAssets } = useWardrobe()
  const [src, setSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [broken, setBroken] = useState(false)

  useEffect(() => {
    let active = true
    setSrc(null)
    setBroken(false)
    setLoading(true)

    if (mode === 'hidden') {
      setLoading(false)
      return
    }

    const custom = customAssets.find((asset) => asset.id === customAssetId)
    const cartoonSrc = cartoonDataUri(cartoonId)

    // 按显示模式排优先级，取第一个能正常显示的来源
    const sources: Array<string | null | Promise<string | null>> =
      mode === 'photo'
        ? [path ? photoUrl(path) : Promise.resolve(null), custom ? photoUrl(custom.photoPath) : null, cartoonSrc]
        : [custom ? photoUrl(custom.photoPath) : null, cartoonSrc]

    const load = async () => {
      for (const source of sources) {
        const value = typeof source === 'string' ? source : await source
        if (!value) continue
        if (!active) return
        setSrc(value)
        setLoading(false)
        return
      }
      // 没有任何可用图片：显示中性占位（不是错误）
      if (!active) return
      setLoading(false)
    }

    void load()
    return () => {
      active = false
    }
  }, [path, mode, cartoonId, customAssetId, photoUrl, customAssets])

  if (mode === 'hidden') {
    return (
      <div className="photo-hidden" role="img" aria-label={`${alt}（已隐藏图片）`}>
        <img src={hangerDataUri} alt="" aria-hidden />
      </div>
    )
  }

  if (loading) {
    return <div className="placeholder" aria-hidden />
  }

  if (broken) {
    // 图片有但加载不出来：明确提示，不悄悄显示错图
    return (
      <div className="placeholder broken" title="图片加载失败">
        <span aria-hidden>⚠️</span>
      </div>
    )
  }

  if (!src) {
    // 这件衣服本来就没有图片
    return <div className="placeholder" aria-hidden />
  }

  return (
    <img
      className={className}
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => {
        setBroken(true)
        setSrc(null)
      }}
    />
  )
}
