'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type FriendNudge = { id: string; sender_id: string; sender_name: string; created_at: string }

export function useFriendNudges(live: boolean) {
  const [nudges, setNudges] = useState<FriendNudge[]>([])
  const [loading, setLoading] = useState(live)
  const [error, setError] = useState(false)
  const refresh = useCallback(async () => {
    if (!live) { setLoading(false); return }
    const { data, error: requestError } = await createClient().rpc('my_friend_nudges')
    if (requestError) setError(true)
    else { setNudges((data ?? []) as FriendNudge[]); setError(false) }
    setLoading(false)
  }, [live])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 30000)
    const onUpdate = () => { void refresh() }
    window.addEventListener('focus', onUpdate)
    window.addEventListener('upcatch:nudges-changed', onUpdate)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onUpdate)
      window.removeEventListener('upcatch:nudges-changed', onUpdate)
    }
  }, [refresh])

  const dismiss = async (id: string) => {
    const { error: requestError } = await createClient().rpc('dismiss_friend_nudge', { p_nudge: id })
    if (requestError) return false
    setNudges(current => current.filter(nudge => nudge.id !== id))
    window.dispatchEvent(new Event('upcatch:nudges-changed'))
    return true
  }

  return { nudges, loading, error, refresh, dismiss }
}
