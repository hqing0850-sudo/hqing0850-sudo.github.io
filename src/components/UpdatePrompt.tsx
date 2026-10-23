import { useEffect, useState } from 'react'

/**
 * Service Worker 下载了新版本时，在底部弹出一条提示，
 * 用户点击后立即切换到新版本。
 */
export function UpdatePrompt() {
  const [applyUpdate, setApplyUpdate] = useState<(() => void) | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<() => void>).detail
      setApplyUpdate(() => detail)
      setVisible(true)
    }
    window.addEventListener('wardrobe:sw-update', handler)
    return () => window.removeEventListener('wardrobe:sw-update', handler)
  }, [])

  if (!visible) return null

  return (
    <div className="update-bar" role="status">
      <span>有新版本可用</span>
      <button
        className="btn small primary"
        onClick={() => {
          applyUpdate?.()
          setVisible(false)
        }}
      >
        立即更新
      </button>
      <button className="btn small ghost" onClick={() => setVisible(false)}>
        稍后
      </button>
    </div>
  )
}
