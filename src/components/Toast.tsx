import { useEffect } from 'react'

export function Toast({
  message,
  tone = 'info',
  onDone
}: {
  message: string
  tone?: 'info' | 'error'
  onDone: () => void
}) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 2400)
    return () => window.clearTimeout(timer)
  }, [message, onDone])

  return (
    <div className={`toast ${tone === 'error' ? 'error' : ''}`} role="status">
      {message}
    </div>
  )
}
