'use client'
import { useEffect, useState } from 'react'
import { PrimaryButton } from '@/components/upcatch/primitives'
import { resendConfirmation } from '@/app/auth/actions'

export function ResendConfirmation({ sentAt, initialSeconds }: { sentAt: number; initialSeconds: number }) {
  const [deadline, setDeadline] = useState(sentAt + 60_000)
  const [seconds, setSeconds] = useState(initialSeconds)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    if (!seconds) return
    const timer = window.setTimeout(() => setSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))), 1000)
    return () => window.clearTimeout(timer)
  }, [seconds, deadline])
  const resend = async () => {
    if (seconds || busy) return
    setBusy(true); setMessage(''); setError('')
    try {
      const result = await resendConfirmation({}, new FormData())
      if (result.error) setError(result.error)
      else { setMessage(result.message || 'Confirmation email requested.'); setDeadline(Date.now() + 60_000); setSeconds(60) }
    } catch { setError('Could not resend confirmation right now. Please try again shortly.') }
    finally { setBusy(false) }
  }
  return <div className="space-y-5">
    {error && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    {message && <p role="status" className="rounded-xl bg-primary/10 p-3 text-sm text-primary">{message}</p>}
    <PrimaryButton type="button" onClick={resend} disabled={busy || seconds > 0} className="w-full">
      {busy ? 'Please wait...' : seconds ? `Resend confirmation in ${seconds}s` : 'Resend confirmation'}
    </PrimaryButton>
  </div>
}
