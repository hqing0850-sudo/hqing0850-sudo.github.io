import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredPrompt = event as BeforeInstallPromptEvent
    // 通知已挂载的界面：现在可以显示“添加到桌面”按钮了
    window.dispatchEvent(new Event('wardrobe:install-available'))
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    window.dispatchEvent(new Event('wardrobe:install-available'))
  })
}

/** 是否已经以“桌面 App”方式打开 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
}

/**
 * 安卓 Chrome / 电脑 Chrome 会给出“安装应用”的入口，
 * 拿到浏览器的事件后就能一键添加到桌面。
 */
export function usePwaInstall() {
  const [canInstall, setCanInstall] = useState(deferredPrompt !== null)

  useEffect(() => {
    const handler = () => setCanInstall(deferredPrompt !== null)
    window.addEventListener('wardrobe:install-available', handler)
    return () => window.removeEventListener('wardrobe:install-available', handler)
  }, [])

  async function install(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    if (!deferredPrompt) return 'unavailable'
    await deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    if (choice.outcome === 'accepted') deferredPrompt = null
    return choice.outcome
  }

  return { canInstall, install, standalone: isStandalone() }
}
