import { useEffect, useState } from 'react'
import { useWardrobe } from '../store/wardrobe'

const EMAIL_KEY = 'wardrobe.familyEmail'

/** 不登录就看不到任何衣柜内容 */
export function LoginPage() {
  const { config, signIn } = useWardrobe()
  const [email, setEmail] = useState(() => {
    try {
      const param = new URLSearchParams(window.location.search).get('email')
      if (param && param.includes('@')) {
        localStorage.setItem(EMAIL_KEY, param)
        return param
      }
      return localStorage.getItem(EMAIL_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // 二维码里带了邮箱：用它预填后，把地址栏里的邮箱参数清掉
  useEffect(() => {
    try {
      const url = new URL(window.location.href)
      if (url.searchParams.has('email')) {
        url.searchParams.delete('email')
        window.history.replaceState({}, '', url.pathname + url.search + url.hash)
      }
    } catch {
      // 清不掉也不影响登录
    }
  }, [])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    if (!email.trim() || !password) {
      setError('请把邮箱和密码都填上')
      return
    }
    setBusy(true)
    setError('')
    try {
      await signIn(email.trim(), password)
      try {
        localStorage.setItem(EMAIL_KEY, email.trim())
      } catch {
        // 记不住邮箱不影响本次登录
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (message.includes('Invalid login credentials')) {
        setError('密码不对，再试一次')
      } else if (message.toLowerCase().includes('network') || message.includes('fetch')) {
        setError('网络不太好，请再试一次')
      } else {
        setError(message.replace(/^登录失败：/, '') || '登录失败，请再试一次')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand" aria-hidden>
          衣
        </div>
        <h1>我的 AI 衣橱</h1>
        <p className="sub">家人共用 · 输入密码进入</p>

        {!config ? (
          <p className="login-error">云端还没有配置，请让家人先联系我。</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="login-field">
              <label htmlFor="login-email">邮箱</label>
              <input
                id="login-email"
                className="input login-input"
                type="email"
                value={email}
                autoComplete="username"
                placeholder="扫码后会自动填好"
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="login-field">
              <label htmlFor="login-password">密码</label>
              <div className="login-pass">
                <input
                  id="login-password"
                  className="input login-input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  autoComplete="current-password"
                  placeholder="输入家庭密码"
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="login-eye"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                >
                  {showPassword ? '隐藏' : '显示'}
                </button>
              </div>
            </div>

            {error ? <p className="login-error">{error}</p> : null}

            <button type="submit" className="btn primary block login-submit" disabled={busy}>
              {busy ? '正在进入…' : '进入衣橱'}
            </button>
          </form>
        )}

        <p className="login-note">第一次登录后，手机会记住邮箱；以后只需要输密码。</p>
      </div>
    </div>
  )
}
