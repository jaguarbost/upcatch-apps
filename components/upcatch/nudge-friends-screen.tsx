'use client'

import { ArrowLeft, BellRing, MapPin, Send, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useUpCatch } from './app-provider'
import { PersonAvatar, PrimaryButton } from './primitives'

type Nudge = { id: string; sender_id: string; sender_name: string; created_at: string }

export function NudgeFriendsScreen() {
  const { state, actions } = useUpCatch()
  const [nudges, setNudges] = useState<Nudge[]>([])
  const [nearbyIds, setNearbyIds] = useState<Set<string> | null>(null)
  const [loading, setLoading] = useState(Boolean(state.live))
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async () => {
    if (!state.live) { setNearbyIds(new Set()); setLoading(false); return }
    const client = createClient()
    const [requests, nearby] = await Promise.all([client.rpc('my_friend_nudges'), client.rpc('nearby_nudge_friends')])
    if (requests.error || nearby.error) { setNearbyIds(null); setNotice(requests.error?.code === 'PGRST202' || nearby.error?.code === 'PGRST202'
      ? 'Nudge Friends is being updated. Please try again shortly.' : 'Could not load nearby friends. Please try again.') }
    else { setNudges((requests.data ?? []) as Nudge[]); setNearbyIds(new Set((nearby.data ?? []) as string[])) }
    setLoading(false)
  }, [state.live])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 30000)
    const onFocus = () => { void refresh() }
    window.addEventListener('focus', onFocus)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus) }
  }, [refresh])

  const send = async (recipient: string | null) => {
    if (!state.live || busy) return
    setBusy(true); setNotice('')
    try {
      const { data, error } = await createClient().rpc('nudge_friends', { p_recipient: recipient })
      if (error) { setNotice(error.code === 'P0001' ? error.message : error.code === 'PGRST202' ? 'Nudge Friends is being updated. Please try again shortly.' : 'Could not send your nudge. Please retry.'); return }
      const count = Number((data as { sent?: number } | null)?.sent ?? 0)
      setNotice(count ? `Nudged ${count} ${count === 1 ? 'friend' : 'friends'}.` : 'Your friends already have a nudge waiting, or were nudged recently.')
      if (count) void fetch('/api/notifications', { method: 'POST' }).catch(() => undefined)
    } catch { setNotice('Connection lost. Please try again.') }
    finally { setBusy(false) }
  }

  const dismiss = async (id: string) => {
    if (!state.live || busy) return
    setBusy(true)
    const { error } = await createClient().rpc('dismiss_friend_nudge', { p_nudge: id })
    if (error) setNotice('Could not dismiss this nudge. Please try again.')
    else setNudges(current => current.filter(nudge => nudge.id !== id))
    setBusy(false)
  }

  const nearbyFriends = state.friends.filter(friend => nearbyIds?.has(friend.person.id))
  const updateLocation = async () => {
    if (!state.live || busy) return
    setBusy(true); setNotice('')
    try {
      const updated = await actions.requestLocation(true, true)
      if (!updated) { setNotice('Could not update your location. Please try again.'); return }
      await refresh()
    }
    catch { setNotice('Could not update your location. Please try again.') }
    finally { setBusy(false) }
  }

  return <main className="absolute inset-0 z-20 overflow-y-auto bg-background pb-28 animate-in fade-in duration-200">
    <header className="flex items-center gap-3 px-5 pt-[max(env(safe-area-inset-top),1.5rem)] pb-4">
      <button type="button" onClick={() => actions.setTab('profile')} aria-label="Back to profile" className="press grid size-11 place-items-center rounded-full bg-card"><ArrowLeft className="size-5" aria-hidden="true" /></button>
      <div><h1 className="font-display text-3xl font-extrabold">Nudge friends</h1><p className="text-sm text-muted-foreground">Let a friend know you want to connect.</p></div>
    </header>

    {notice && <p role="status" className="mx-4 mb-4 rounded-2xl bg-primary/10 px-4 py-3 text-sm font-semibold text-primary">{notice}</p>}

    <section className="mx-4 rounded-3xl bg-card p-4" aria-labelledby="received-nudges">
      <h2 id="received-nudges" className="flex items-center gap-2 font-display text-lg font-extrabold"><BellRing className="size-5 text-primary" aria-hidden="true" /> Requests to connect</h2>
      {loading ? <p className="mt-3 text-sm text-muted-foreground">Loading requests…</p> : nudges.length ? <ul className="mt-3 space-y-2">{nudges.map(nudge => <li key={nudge.id} className="flex items-center gap-3 rounded-2xl bg-muted p-3">
        <PersonAvatar photo={`/api/friend-photo?id=${encodeURIComponent(nudge.sender_id)}`} initials={nudge.sender_name.slice(0,2).toUpperCase()} size={44} />
        <div className="min-w-0 flex-1"><p className="font-semibold">{nudge.sender_name} wants to connect</p><p className="text-xs text-muted-foreground">{new Date(nudge.created_at).toLocaleString('en-GB')}</p></div>
        <button type="button" disabled={busy} onClick={() => void dismiss(nudge.id)} className="press min-h-10 rounded-xl px-3 text-xs font-bold text-primary disabled:opacity-50">Dismiss</button>
      </li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">No friend nudges right now.</p>}
    </section>

    <section className="mx-4 mt-4 rounded-3xl bg-card p-4" aria-labelledby="send-nudges">
      <div className="flex items-center justify-between gap-3"><h2 id="send-nudges" className="flex items-center gap-2 font-display text-lg font-extrabold"><Users className="size-5 text-primary" aria-hidden="true" /> Nearby friends</h2><span className="text-xs font-bold text-muted-foreground">{nearbyFriends.length}</span></div>
      <p className="mt-2 text-xs text-muted-foreground">Within 3 miles, based on both members’ approximate locations from the last hour.</p>
      <button type="button" disabled={busy || !state.live} onClick={() => void updateLocation()} className="press mt-3 flex min-h-10 items-center gap-2 text-sm font-bold text-primary disabled:opacity-50"><MapPin className="size-4" aria-hidden="true" /> Update my location</button>
      {nearbyIds === null ? <p className="mt-3 text-sm text-muted-foreground">Checking nearby friends…</p> : nearbyFriends.length ? <>
        <PrimaryButton variant="live" disabled={busy || !state.live} onClick={() => void send(null)} className="mt-4 w-full"><Send className="size-4" aria-hidden="true" /> Nudge all nearby friends</PrimaryButton>
        <p className="mt-2 text-xs text-muted-foreground">You can nudge everyone nearby once every 6 hours. Friends with a pending nudge are skipped.</p>
        <ul className="mt-4 divide-y divide-border/60">{nearbyFriends.map(friend => <li key={friend.person.id} className="flex min-h-16 items-center gap-3 py-2">
          <PersonAvatar photo={friend.person.photo} initials={friend.person.initials} size={44} />
          <div className="min-w-0 flex-1"><p className="font-semibold">{friend.person.name}</p><p className="text-xs text-muted-foreground">{friend.status === 'free' ? 'Online' : 'Offline'}</p></div>
          <button type="button" disabled={busy || !state.live} onClick={() => void send(friend.person.id)} className="press min-h-11 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50">Nudge</button>
        </li>)}</ul>
      </> : <p className="mt-3 text-sm text-muted-foreground">No friends nearby right now. Update your location or try again when a friend is close.</p>}
    </section>
  </main>
}
