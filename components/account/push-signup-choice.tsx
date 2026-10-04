'use client'

import { useEffect, useState } from 'react'
import { SIGNUP_PUSH_CHOICE_KEY } from '@/lib/push-client'

export function PushSignupChoice() {
  const [selected, setSelected] = useState(false)

  useEffect(() => {
    const saveChoice = () => window.localStorage.setItem(SIGNUP_PUSH_CHOICE_KEY, selected ? 'yes' : 'no')
    document.addEventListener('submit', saveChoice, true)
    return () => document.removeEventListener('submit', saveChoice, true)
  }, [selected])

  return (
    <label className="flex items-start gap-3 rounded-2xl bg-muted p-3 text-sm leading-relaxed">
      <input
        type="checkbox"
        checked={selected}
        onChange={(event) => setSelected(event.target.checked)}
        className="mt-1 size-4 accent-primary"
      />
      <span><strong>Get push notifications</strong> (optional, recommended). After sign-in, we will ask this device for permission to send invites and friend alerts.</span>
    </label>
  )
}
