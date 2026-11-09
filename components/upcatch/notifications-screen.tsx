'use client'

import { ArrowLeft, Bell, ChevronRight, Inbox } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useUpCatch, type Tab } from './app-provider'

type Notification = {
  id: string
  title: string
  body: string
  destination: 'map' | 'wall' | 'messages' | 'meetups' | 'nudges'
  chat: 'live' | 'scheduled' | 'friend' | null
  post_id: string | null
  peer_id: string | null
  created_at: string
  read_at: string | null
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function NotificationsScreen() {
  const { state, actions } = useUpCatch()
  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(Boolean(state.live))
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!state.live) { setLoading(false); return }
    const { data, error: queryError } = await createClient().from('member_notifications')
      .select('id,title,body,destination,chat,post_id,peer_id,created_at,read_at')
      .order('created_at', { ascending: false }).limit(50)
    if (queryError) setError('Notifications could not be loaded. Please try again.')
    else { setItems((data ?? []) as Notification[]); setError('') }
    setLoading(false)
  }, [state.live])

  useEffect(() => {
    void refresh()
    const onFocus = () => { void refresh() }
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, 30000)
    window.addEventListener('focus', onFocus)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus) }
  }, [refresh])

  const open = async (item: Notification, chatFromNudge = false) => {
    if (!item.read_at && state.live) {
      const { error: updateError } = await createClient().from('member_notifications')
        .update({ read_at: new Date().toISOString() }).eq('id', item.id)
      if (updateError) { setError('This notification could not be marked as read. Please retry.'); return }
      setItems(current => current.map(row => row.id === item.id ? { ...row, read_at: new Date().toISOString() } : row))
      window.dispatchEvent(new Event('upcatch:notifications-updated'))
    }
    if (chatFromNudge && item.peer_id && uuid.test(item.peer_id)) actions.openFriendChat(item.peer_id)
    else if (item.destination === 'messages') {
      if (item.chat === 'scheduled' && item.post_id && uuid.test(item.post_id)) actions.openMessages('scheduled', item.post_id)
      else if (item.chat === 'friend' && item.peer_id && uuid.test(item.peer_id)) actions.openFriendChat(item.peer_id)
      else if (item.chat === 'live') actions.openMessages('live')
      else actions.setTab('messages')
    } else actions.setTab(item.destination as Tab)
  }

  return <main className="absolute inset-0 z-20 flex flex-col bg-background animate-in fade-in duration-200">
    <header className="flex items-center gap-3 px-5 pt-[max(env(safe-area-inset-top),1.25rem)] pb-4">
      <button type="button" onClick={() => actions.setTab('map')} aria-label="Back to map" className="press grid size-11 place-items-center rounded-full bg-card"><ArrowLeft className="size-5" aria-hidden="true" /></button>
      <div className="flex-1"><h1 className="font-display text-3xl font-extrabold">Notifications</h1><p className="text-sm text-muted-foreground">See what brought you back to UpCatch.</p></div>
      <Bell className="size-6 text-primary" aria-hidden="true" />
    </header>
    <div className="flex-1 overflow-y-auto px-4 pb-28">
      {error && <p role="alert" className="mb-3 rounded-2xl bg-primary/10 px-4 py-3 text-sm font-semibold text-primary">{error}</p>}
      {loading ? <p className="py-8 text-center text-sm text-muted-foreground">Loading notifications…</p>
        : items.length ? <ul className="space-y-2">{items.map(item => <li key={item.id} className="rounded-3xl bg-card">
          <button type="button" onClick={() => { void open(item) }} className="press flex w-full items-center gap-3 rounded-3xl p-4 text-left">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><Bell className="size-5" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 font-display font-extrabold">{item.title}{!item.read_at && <span className="size-2 shrink-0 rounded-full bg-live" aria-label="Unread" />}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{item.body}</span>
              <span className="mt-2 block text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString('en-GB')}</span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
          {item.destination==='nudges' && item.peer_id && <button type="button" onClick={() => { void open(item,true) }} className="press mx-4 mb-3 min-h-10 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">Chat with friend</button>}
        </li>)}</ul> : <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <span className="grid size-20 place-items-center rounded-full bg-muted"><Inbox className="size-8 text-muted-foreground" aria-hidden="true" /></span>
          <h2 className="font-display text-xl font-extrabold">Nothing new yet</h2>
          <p className="text-sm text-muted-foreground">Meetup updates, messages and friend nudges will appear here.</p>
        </div>}
    </div>
  </main>
}
