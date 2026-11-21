'use client'

import { ArrowLeft, BellRing, CircleHelp, MapPin, Send, Users } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useUpCatch } from './app-provider'
import { PersonAvatar, PrimaryButton } from './primitives'
import { useFriendNudges } from './use-friend-nudges'
import { useNudgeClock } from './use-nudge-clock'
import { NUDGE_WINDOW_MS, nudgeTimeLeft, nudgeTimerLabel } from '@/lib/nudge-expiry'

export function NudgeFriendsScreen() {
  const { state, actions } = useUpCatch()
  const {nudges, sent, sentError, loading: nudgeLoading, error: nudgeError, refresh: refreshNudges}=useFriendNudges(Boolean(state.live))
  const now = useNudgeClock()
  const activeNudges = nudges.filter(nudge => nudgeTimeLeft(nudge.created_at, now) > 0)
  const sentByFriend = new Map(sent.filter(nudge => nudgeTimeLeft(nudge.created_at, now) > 0).map(nudge => [nudge.recipient_id, nudge]))
  const [nearbyIds, setNearbyIds] = useState<Set<string> | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [helpOpen, setHelpOpen] = useState(false)
  const helpDialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { if (helpOpen) helpDialog.current?.showModal() }, [helpOpen])

  const refresh = useCallback(async () => {
    if (!state.live) { setNearbyIds(new Set()); return }
    const nearby = await createClient().rpc('nearby_nudge_friends')
    if (nearby.error) { setNearbyIds(null); setNotice(nearby.error.code === 'PGRST202'
      ? 'Nudge Friends is being updated. Please try again shortly.' : 'Could not load friends. Please try again.') }
    else setNearbyIds(new Set((nearby.data ?? []) as string[]))
  }, [state.live])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 30000)
    const onFocus = () => { void refresh() }
    window.addEventListener('focus', onFocus)
    window.addEventListener('upcatch:native-resume', onFocus)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus); window.removeEventListener('upcatch:native-resume', onFocus) }
  }, [refresh])

  const send = async (recipient: string | null) => {
    if (!state.live || busy) return
    setBusy(true); setNotice('')
    try {
      const { data, error } = await createClient().rpc('nudge_friends', { p_recipient: recipient })
      if (error) { setNotice(error.code === 'P0001' ? error.message : error.code === 'PGRST202' ? 'Nudge Friends is being updated. Please try again shortly.' : 'Could not send your nudge. Please retry.'); return }
      const count = Number((data as { sent?: number } | null)?.sent ?? 0)
      setNotice(count ? `Nudged ${count} ${count === 1 ? 'friend' : 'friends'}. Visible for 30 minutes.` : 'Your friends already have a nudge waiting.')
      if (count) {
        try {
          const response = await fetch('/api/notifications', { method: 'POST' })
          if (!response.ok) throw new Error('Dispatch unavailable')
        } catch {
          setNotice(`Nudged ${count} ${count === 1 ? 'friend' : 'friends'}. Your request is saved, but push dispatch could not be confirmed.`)
        }
        await Promise.all([refreshNudges(), refresh()])
      }
    } catch { setNotice('Connection lost. Please try again.') }
    finally { setBusy(false) }
  }

  const nearbyFriends = Array.from(nearbyIds ?? []).flatMap(id => {
    const friend = state.friends.find(item => item.person.id === id)
    return friend ? [friend] : []
  })
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
      <div><h1 className="font-display text-3xl font-extrabold">Nudge friends</h1><p className="text-sm text-muted-foreground">Let a friend know you want to connect.</p>
        <button type="button" aria-haspopup="dialog" onClick={() => setHelpOpen(true)} className="press inline-flex min-h-11 items-center gap-1.5 rounded-lg text-xs font-bold text-primary focus-visible:ring-2 focus-visible:ring-primary"><CircleHelp className="size-4" aria-hidden="true" />What is a nudge?</button>
      </div>
    </header>

    {notice && <p role="status" className="mx-4 mb-4 rounded-2xl bg-primary/10 px-4 py-3 text-sm font-semibold text-primary">{notice}</p>}

    <section className="mx-4 rounded-3xl bg-card p-4" aria-labelledby="received-nudges">
      <h2 id="received-nudges" className="flex items-center gap-2 font-display text-lg font-extrabold"><BellRing className="size-5 text-primary" aria-hidden="true" /> Nudges from friends</h2>
      {nudgeError ? <p role="status" className="mt-3 text-sm text-muted-foreground">Could not load friend nudges. Please try again.</p> : nudgeLoading ? <p className="mt-3 text-sm text-muted-foreground">Loading nudges...</p> : activeNudges.length ? <ul className="mt-3 space-y-2">{activeNudges.map(nudge => {
        const left = nudgeTimeLeft(nudge.created_at, now)
        const friend = state.friends.find(item => item.person.id === nudge.sender_id)
        return <li key={nudge.id}>
          <button type="button" onClick={() => { if (nudgeTimeLeft(nudge.created_at, Date.now()) > 0) actions.openFriendChat(nudge.sender_id) }} className="press relative flex min-h-20 w-full items-center gap-3 overflow-hidden rounded-2xl bg-primary p-3 text-left text-primary-foreground" aria-label={`Open chat with ${nudge.sender_name}`}>
            <NudgeProgress left={left} />
            <span className="relative"><PersonAvatar photo={`/api/friend-photo?id=${encodeURIComponent(nudge.sender_id)}`} initials={nudge.sender_name.slice(0,2).toUpperCase()} size={44} /></span>
            <span className="relative min-w-0 flex-1"><span className="block truncate font-semibold">{nudge.sender_name} nudged you</span><span className="block text-xs opacity-80">{friend?.status === 'free' ? 'Online' : 'Offline'} · Tap to chat</span></span>
            <span className="relative shrink-0 text-sm font-bold tabular-nums" aria-label="Time remaining">{nudgeTimerLabel(left)}</span>
          </button>
        </li>
      })}</ul> : <p className="mt-3 text-sm text-muted-foreground">No friend nudges right now.</p>}
    </section>

    <section className="mx-4 mt-4 rounded-3xl bg-card p-4" aria-labelledby="send-nudges">
      <div className="flex items-center justify-between gap-3"><h2 id="send-nudges" className="flex items-center gap-2 font-display text-lg font-extrabold"><Users className="size-5 text-primary" aria-hidden="true" /> Friends</h2><span className="text-xs font-bold text-muted-foreground">{nearbyFriends.length}</span></div>
      <p className="mt-2 text-xs text-muted-foreground">Your most nudged friends appear first. Tap a friend to nudge them for 30 minutes.</p>
      {sentError && <p role="status" className="mt-2 text-xs text-muted-foreground">Sent nudges could not be loaded. Please try again.</p>}
      <button type="button" disabled={busy || !state.live} onClick={() => void updateLocation()} className="press mt-3 flex min-h-10 items-center gap-2 text-sm font-bold text-primary disabled:opacity-50"><MapPin className="size-4" aria-hidden="true" /> Update my location</button>
      {nearbyIds === null ? <p className="mt-3 text-sm text-muted-foreground">Loading friends…</p> : nearbyFriends.length ? <>
        <PrimaryButton variant="live" disabled={busy || !state.live || nudgeLoading || sentError} onClick={() => void send(null)} className="mt-4 w-full"><Send className="size-4" aria-hidden="true" /> Nudge all friends</PrimaryButton>
        <p className="mt-2 text-xs text-muted-foreground">Friends with a pending nudge are skipped.</p>
        <ul className="mt-4 space-y-2">{nearbyFriends.map(friend => {
          const active = sentByFriend.get(friend.person.id)
          const left = active ? nudgeTimeLeft(active.created_at, now) : 0
          return <li key={friend.person.id}>
            <button type="button" disabled={busy || !state.live || nudgeLoading || sentError || left > 0} onClick={() => void send(friend.person.id)} className="press relative flex min-h-20 w-full items-center gap-3 overflow-hidden rounded-2xl bg-primary p-3 text-left text-primary-foreground disabled:cursor-default" aria-label={left > 0 ? `Nudge sent to ${friend.person.name}` : `Nudge ${friend.person.name}`}>
              {left > 0 && <NudgeProgress left={left} />}
              <span className="relative"><PersonAvatar photo={friend.person.photo} initials={friend.person.initials} size={44} /></span>
              <span className="relative min-w-0 flex-1"><span className="block truncate font-semibold">{friend.person.name}</span><span className="block text-xs opacity-80">{friend.status === 'free' ? 'Online' : 'Offline'} · {left > 0 ? 'Nudge sent' : 'Tap to nudge'}</span></span>
              {left > 0 ? <span className="relative shrink-0 text-sm font-bold tabular-nums" aria-label="Time remaining">{nudgeTimerLabel(left)}</span> : <Send className="relative size-5 shrink-0" aria-hidden="true" />}
            </button>
          </li>
        })}</ul>
      </> : <p className="mt-3 text-sm text-muted-foreground">No friends available to nudge right now.</p>}
    </section>
    {helpOpen && <dialog ref={helpDialog} onCancel={() => setHelpOpen(false)} aria-labelledby="nudge-help-title" aria-describedby="nudge-help-description" className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-sm overflow-y-auto rounded-3xl border border-border bg-card p-5 text-foreground shadow-xl backdrop:bg-black/60">
      <h2 id="nudge-help-title" className="font-display text-xl font-extrabold">What is a nudge?</h2>
      <div id="nudge-help-description" className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>A nudge lets a friend know you would like to catch up. Tap a friend to send one, or choose Nudge all friends.</p>
        <p>Your friend can tap your nudge to open your private chat and make plans. There is no need to accept or reject it.</p>
        <p>Nudges last 30 minutes. The countdown shows how long is left. When it expires, you can nudge again. Your chat stays available.</p>
      </div>
      <PrimaryButton onClick={() => setHelpOpen(false)} className="mt-5 h-12 w-full text-sm">Got it</PrimaryButton>
    </dialog>}
  </main>
}

function NudgeProgress({ left }: { left: number }) {
  return <span className="pointer-events-none absolute inset-y-0 left-0 bg-primary-foreground/15 transition-[width] duration-1000 ease-linear motion-reduce:transition-none" style={{ width: `${left / NUDGE_WINDOW_MS * 100}%` }} aria-hidden="true" />
}
