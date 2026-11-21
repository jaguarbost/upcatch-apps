'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type FriendNudge = { id: string; sender_id: string; sender_name: string; created_at: string }
export type SentFriendNudge = { id: string; recipient_id: string; created_at: string }

export function useFriendNudges(live: boolean) {
  const [nudges, setNudges] = useState<FriendNudge[]>([])
  const [sent, setSent] = useState<SentFriendNudge[]>([])
  const [sentError, setSentError] = useState(false)
  const [loading, setLoading] = useState(live)
  const [error, setError] = useState(false)
  const refresh = useCallback(async () => {
    if (!live) { setNudges([]); setSent([]); setLoading(false); return }
    const [received, outgoing] = await Promise.all([
      createClient().rpc('my_friend_nudges'),
      createClient().rpc('my_sent_friend_nudges'),
    ])
    const { data, error: requestError } = received
    if (requestError) setError(true)
    else { setNudges((data ?? []) as FriendNudge[]); setError(false) }
    if (outgoing.error) setSentError(true)
    else { setSent((outgoing.data ?? []) as SentFriendNudge[]); setSentError(false) }
    setLoading(false)
  }, [live])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 30000)
    const onUpdate = () => { void refresh() }
    window.addEventListener('focus', onUpdate)
    window.addEventListener('upcatch:native-resume', onUpdate)
    window.addEventListener('upcatch:nudges-changed', onUpdate)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onUpdate)
      window.removeEventListener('upcatch:native-resume', onUpdate)
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

  return { nudges, sent, sentError, loading, error, refresh, dismiss }
}
