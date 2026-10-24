import { useEffect, useState } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { TabBar } from './components/TabBar'
import { UpdatePrompt } from './components/UpdatePrompt'
import { AddPage } from './pages/AddPage'
import { DetailPage } from './pages/DetailPage'
import { HomePage } from './pages/HomePage'
import { LaundryPage } from './pages/LaundryPage'
import { LoginPage } from './pages/LoginPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { SettingsPage } from './pages/SettingsPage'
import { WardrobePage } from './pages/WardrobePage'
import { useWardrobe } from './store/wardrobe'

export function App() {
  const { ready, authReady, session, error, dismissError } = useWardrobe()
  const location = useLocation()
  const [showError, setShowError] = useState(false)

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  useEffect(() => {
    setShowError(Boolean(error))
  }, [error])

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

  if (!ready) {
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
