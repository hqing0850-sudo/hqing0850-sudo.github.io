import { useEffect, useRef, useState } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { TabBar } from './components/TabBar'
import { UpdatePrompt } from './components/UpdatePrompt'
import { AddPage } from './pages/AddPage'
import { DetailPage } from './pages/DetailPage'
import { HomePage } from './pages/HomePage'
import { LaundryPage } from './pages/LaundryPage'
import { LoginPage } from './pages/LoginPage'
import { OutfitEditPage } from './pages/OutfitEditPage'
import { OutfitsPage } from './pages/OutfitsPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { SettingsPage } from './pages/SettingsPage'
import { WardrobePage } from './pages/WardrobePage'
import { useWardrobe } from './store/wardrobe'

export function App() {
  const { ready, authReady, session, error, dismissError } = useWardrobe()
  const location = useLocation()
  const [showError, setShowError] = useState(false)
  const hasLoadedOnce = useRef(false)
  const lastUserId = useRef<string | null>(null)

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  useEffect(() => {
    setShowError(Boolean(error))
  }, [error])

  // 只有换账号（或第一次登录）才重新显示整页加载；
  // 令牌刷新、切回前台不能把正在填写的表单卸载掉。
  useEffect(() => {
    const id = session?.user.id ?? null
    if (id !== lastUserId.current) {
      lastUserId.current = id
      hasLoadedOnce.current = false
    }
  }, [session?.user.id])

  useEffect(() => {
    if (ready) hasLoadedOnce.current = true
  }, [ready])

  if (!authReady) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <span>正在检查登录…</span>
      </div>
    )
  }

  // 登录门禁：没有登录就看不到任何衣柜内容（本机模式也不放行）
  if (!session) {
    return <LoginPage />
  }

  if (!ready && !hasLoadedOnce.current) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <span>正在打开衣橱…</span>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <TabBar />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/wardrobe" element={<WardrobePage />} />
          <Route path="/outfits" element={<OutfitsPage />} />
          <Route path="/outfits/new" element={<OutfitEditPage />} />
          <Route path="/outfits/:id/edit" element={<OutfitEditPage />} />
          <Route path="/laundry" element={<LaundryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/add" element={<AddPage />} />
          <Route path="/item/:id" element={<DetailPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </main>

      {showError && error ? (
        <div className="toast error" role="alert" onClick={dismissError}>
          {error}
        </div>
      ) : null}

      <UpdatePrompt />
    </div>
  )
}
