import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Toast } from '../components/Toast'
import { useWardrobe } from '../store/wardrobe'

/**
 * 忘记密码 / 重置密码页。
 *
 * 流程：设置页点「忘记密码」→ 收到 Supabase 邮件 → 点邮件里的链接
 * → 跳到本站 /reset-password → 在这里设置新密码。
 */
export function ResetPasswordPage() {
  const navigate = useNavigate()
  const { session, config, updatePassword, sendResetPassword } = useWardrobe()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ message: string; tone: 'info' | 'error' } | null>(null)

  useEffect(() => {
    if (config) return
    // 没配置云端就没法重置，提示用户先配置
  }, [config])

  async function handleUpdate(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    if (password.length < 6) {
      setToast({ message: '密码至少 6 位', tone: 'error' })
      return
    }
    if (password !== confirmPassword) {
      setToast({ message: '两次输入的密码不一致', tone: 'error' })
      return
    }
    setBusy(true)
    try {
      await updatePassword(password)
      setToast({ message: '密码已更新，现在可以用新密码登录了', tone: 'info' })
      setTimeout(() => navigate('/settings'), 1500)
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : '修改失败', tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function handleSendLink(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    if (!email.trim()) {
      setToast({ message: '请填写邮箱', tone: 'error' })
      return
    }
    setBusy(true)
    try {
      await sendResetPassword(email)
      setToast({ message: '重置密码的邮件已发送，请查收（记得看垃圾邮件箱）', tone: 'info' })
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : '发送失败', tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>重置密码</h1>
          <p className="sub">
            {session ? '设置一个新的登录密码' : '填写注册邮箱，我们会发一封重置邮件给你'}
          </p>
        </div>
        <button className="icon-btn" onClick={() => navigate('/settings')} aria-label="返回">
          ✕
        </button>
      </header>

      {session ? (
        <form onSubmit={handleUpdate}>
          <div className="field">
            <label htmlFor="p-new">新密码</label>
            <input
              id="p-new"
              className="input"
              type="password"
              value={password}
              autoComplete="new-password"
              placeholder="至少 6 位"
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="p-confirm">再输一次</label>
            <input
              id="p-confirm"
              className="input"
              type="password"
              value={confirmPassword}
              autoComplete="new-password"
              placeholder="确认新密码"
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          <button type="submit" className="btn primary block" disabled={busy}>
            {busy ? '保存中…' : '保存新密码'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleSendLink}>
          <div className="field">
            <label htmlFor="p-email">注册邮箱</label>
            <input
              id="p-email"
              className="input"
              type="email"
              value={email}
              autoComplete="username"
              placeholder="you@example.com"
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <button type="submit" className="btn primary block" disabled={busy}>
            {busy ? '发送中…' : '发送重置邮件'}
          </button>
          <p className="note" style={{ marginTop: 12 }}>
            收到邮件后点里面的链接，就会跳到这个页面来设置新密码。
          </p>
        </form>
      )}

      {toast ? <Toast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} /> : null}
    </>
  )
}
