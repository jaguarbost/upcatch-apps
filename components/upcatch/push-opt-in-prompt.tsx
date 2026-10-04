'use client'

import { useEffect, useState } from 'react'
import { Bell, LoaderCircle } from 'lucide-react'
import { SIGNUP_PUSH_CHOICE_KEY } from '@/lib/push-client'
import { useUpCatch } from './app-provider'
import { PrimaryButton } from './primitives'

export function PushOptInPrompt() {
  const { state, actions } = useUpCatch()
  const [open, setOpen] = useState(false)
  const memberId = state.live?.memberId
  const key = memberId ? 'upcatch:push-invited:' + memberId : ''

  useEffect(() => {
    if (!key || !state.onboarded || state.pushEnabled || window.localStorage.getItem(key) === 'seen') return
    if (window.localStorage.getItem(SIGNUP_PUSH_CHOICE_KEY) === 'no') {
      window.localStorage.setItem(key, 'seen')
      window.localStorage.removeItem(SIGNUP_PUSH_CHOICE_KEY)
      return
    }
    const timer = window.setTimeout(() => setOpen(true), 1500)
    return () => window.clearTimeout(timer)
  }, [key, state.onboarded, state.pushEnabled])

  useEffect(() => {
    if (!state.pushEnabled || !key) return
    window.localStorage.setItem(key, 'seen')
    window.localStorage.removeItem(SIGNUP_PUSH_CHOICE_KEY)
    setOpen(false)
  }, [key, state.pushEnabled])

  if (!open || !state.live || state.pushEnabled || state.phase !== 'idle' || state.createStep !== 0 || state.locationPrompt || state.friendsSheet) return null

  const dismiss = () => {
    window.localStorage.setItem(key, 'seen')
    window.localStorage.removeItem(SIGNUP_PUSH_CHOICE_KEY)
    setOpen(false)
  }

  return (
    <div className="absolute inset-0 z-[70] flex items-center justify-center bg-foreground/40 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="push-invite-title" className="w-full max-w-md rounded-3xl bg-card p-5 shadow-xl">
        <span className="grid size-12 place-items-center rounded-2xl bg-live text-live-foreground"><Bell className="size-6" aria-hidden="true" /></span>
        <h2 id="push-invite-title" className="mt-4 font-display text-2xl font-extrabold">Stay in the loop</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Enable optional push notifications for invites, meetup updates and friends coming online. We recommend them so you do not miss a time-limited invite.</p>
        <PrimaryButton onClick={() => actions.setPushEnabled(true)} disabled={state.pushBusy} className="mt-5 w-full">
          {state.pushBusy && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
          {state.pushBusy ? 'Connecting this device...' : 'Enable push notifications'}
        </PrimaryButton>
        <button type="button" onClick={dismiss} disabled={state.pushBusy} className="press mt-2 min-h-11 w-full rounded-2xl text-sm font-semibold text-muted-foreground">Not now</button>
      </section>
    </div>
  )
}
