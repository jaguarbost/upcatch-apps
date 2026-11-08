'use client'

import { ArrowUpRight, CalendarDays, Clock3, MapPin, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { INTENTS, intentById, type IntentId } from '@/lib/upcatch-data'
import { Chip, PersonAvatar, PrimaryButton } from './primitives'
import { useUpCatch } from './app-provider'
import { CancellationWarning } from './cancellation-warning'

type JoinRequest = { user_id: string; name: string }
type ScheduledPost = {
  post_id: string
  author_name: string
  intent: IntentId
  starts_at: string
  note: string
  duration_min: number
  radius_km: number
  preferences: string[]
  request_status: 'pending' | 'accepted' | 'rejected' | 'cancelled' | null
  pending_count: number
  requests: JoinRequest[]
  accepted_name: string | null
  is_mine: boolean
  post_status: 'open' | 'matched'
}
type Cursor = { starts_at: string; post_id: string }
const PAGE_SIZE = 20

function when(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value))
}

export function ScheduledWall({ enabled }: { enabled: boolean }) {
  const { state, actions } = useUpCatch()
  const [filter, setFilter] = useState<IntentId | 'all'>('all')
  const [posts, setPosts] = useState<ScheduledPost[]>([])
  const [cursor, setCursor] = useState<Cursor | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null)

  const loadPage = useCallback(async (after: Cursor | null, reset: boolean, activity: IntentId | 'all') => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: loadError } = await createClient().rpc('list_scheduled_posts', {
        p_after_starts: after?.starts_at ?? null,
        p_after_id: after?.post_id ?? null,
        p_limit: PAGE_SIZE,
        p_intent: activity === 'all' ? null : activity,
      })
      if (loadError) throw loadError
      const page = (data ?? []) as ScheduledPost[]
      setPosts((current) => reset ? page : [...current, ...page.filter((post) => !current.some((item) => item.post_id === post.post_id))])
      const last = page.at(-1)
      setCursor(last ? { starts_at: last.starts_at, post_id: last.post_id } : after)
      setHasMore(page.length === PAGE_SIZE)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the wall.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (enabled) void loadPage(null, true, filter)
  }, [enabled, filter, loadPage])

  async function requestJoin(postId: string) {
    if (workingId) return
    setWorkingId(postId)
    setError(null)
    try {
      const { error: saveError } = await createClient().rpc('request_scheduled_post', { p_post: postId })
      if (saveError) throw saveError
      setPosts((current) => current.map((post) => post.post_id === postId ? { ...post, request_status: 'pending' } : post))
      setNotice('Request sent. The post owner can accept or reject it.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send your request.')
    } finally {
      setWorkingId(null)
    }
  }

  async function respond(postId: string, requesterId: string, accept: boolean) {
    if (workingId) return
    setWorkingId(postId)
    setError(null)
    try {
      const { error: saveError } = await createClient().rpc('respond_scheduled_request', {
        p_post: postId, p_requester: requesterId, p_accept: accept,
      })
      if (saveError) throw saveError
      setNotice(accept ? 'Request accepted.' : 'Request declined.')
      await loadPage(null, true, filter)
      if (accept) await actions.refreshFriends()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not respond to this request.')
    } finally {
      setWorkingId(null)
    }
  }

  async function cancelPost(postId: string, matched: boolean) {
    if (workingId) return
    setWorkingId(postId)
    setError(null)
    try {
      const { error: saveError } = await createClient().rpc(matched ? 'cancel_scheduled_plan' : 'cancel_scheduled_post', { p_post: postId })
      if (saveError) throw saveError
      setPosts((current) => current.filter((post) => post.post_id !== postId))
      setConfirmCancel(null)
      setNotice(matched ? 'Meetup cancelled for both of you.' : 'Your post was removed from the wall.')
      if(matched)await actions.refreshFriends()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove your post.')
    } finally {
      setWorkingId(null)
    }
  }

  if (!enabled) return <section className="rounded-3xl bg-card p-6 text-center">
    <CalendarDays className="mx-auto size-9 text-primary" aria-hidden="true" />
    <h2 className="mt-3 font-display text-xl font-extrabold">Scheduled wall</h2>
    <p className="mt-2 text-sm text-muted-foreground">Sign in to see plans in your city.</p>
  </section>

  return <section className="flex flex-col gap-3" aria-label="Scheduled wall">
    <div className="flex items-center justify-between gap-3">
      <div>
        <h2 className="font-display text-xl font-extrabold">Scheduled wall</h2>
        <p className="text-xs text-muted-foreground">Plans in your city. Meet only at a public venue.</p>
      </div>
      <button type="button" onClick={() => void loadPage(null, true, filter)} disabled={loading} aria-label="Refresh scheduled wall" className="press grid size-11 shrink-0 place-items-center rounded-full bg-muted disabled:opacity-50">
        <RefreshCw className={loading ? 'size-5 animate-spin' : 'size-5'} aria-hidden="true" />
      </button>
    </div>
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar" aria-label="Filter plans">
      <Chip active={filter === 'all'} onClick={() => setFilter('all')}>All</Chip>
      {INTENTS.map((activity) => <Chip key={activity.id} active={filter === activity.id} onClick={() => setFilter(activity.id)}>{activity.label}</Chip>)}
    </div>
    <PrimaryButton variant="live" className="h-12 w-full text-sm" onClick={() => actions.openCreate('scheduled')}>
      <Plus className="size-5" aria-hidden="true" /> Create scheduled invite
    </PrimaryButton>
    {state.scheduledPostNotice && <div role="status" className="flex items-center justify-between gap-3 rounded-2xl bg-live/25 p-3 text-sm font-semibold">
      <span>{state.scheduledPostNotice}</span>
      <button type="button" onClick={actions.dismissScheduledPostNotice} className="press min-h-11 rounded-xl bg-card px-3 text-xs font-bold">Dismiss</button>
    </div>}
    {error && <p role="alert" className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="rounded-2xl bg-live/20 p-3 text-sm">{notice}</p>}
    {loading && posts.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Loading plans...</p>}
    {!loading && posts.length === 0 && !error && <p className="rounded-3xl bg-card p-6 text-center text-sm text-muted-foreground">No upcoming plans here yet. Be the first to post.</p>}
    <ul className="flex flex-col gap-3">
      {posts.map((post) => {
        const activity = intentById(post.intent)
        const ActivityIcon = activity.icon
        const initials = post.author_name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?'
        const visiblePreferences = post.preferences.filter((preference) => preference !== 'Verified ID only' && preference !== 'Similar age')
        return <li key={post.post_id} className="overflow-hidden rounded-3xl border border-primary/15 bg-card shadow-md shadow-primary/5">
          <div className="h-1.5 bg-live" aria-hidden="true" />
          <div className="p-4">
            <div className="flex items-center gap-3">
              <span className="shrink-0 rounded-full ring-4 ring-live/25">
                <PersonAvatar photo={`/api/wall-photo?post=${encodeURIComponent(post.post_id)}`} initials={initials} size={56} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-base font-extrabold">{post.author_name}{post.is_mine ? ' (you)' : ''}</p>
                <p className="text-xs font-semibold text-muted-foreground">has a plan for you</p>
              </div>
              <span className="rounded-full bg-live/30 px-3 py-1.5 text-[11px] font-extrabold text-live-foreground">
                {post.post_status === 'open' ? 'OPEN INVITE' : 'FILLED'}
              </span>
            </div>
            <div className="mt-4 flex gap-3 rounded-2xl bg-primary/5 p-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-live text-live-foreground">
                <ActivityIcon className="size-6" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="font-display text-xl font-extrabold leading-tight text-primary">{activity.label} invite</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">{post.note}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">
                <CalendarDays className="size-4" aria-hidden="true" /> {when(post.starts_at)}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-2 text-xs font-bold">
                <Clock3 className="size-4 text-primary" aria-hidden="true" /> {post.duration_min} min
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-2 text-xs font-bold">
                <MapPin className="size-4 text-primary" aria-hidden="true" /> Can travel {Number((post.radius_km / 1.609344).toFixed(1))} mi
              </span>
            </div>
            {visiblePreferences.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Host preferences">
              {visiblePreferences.map((preference) => <span key={preference} className="rounded-full bg-live/25 px-2.5 py-1 text-[11px] font-semibold">{preference}</span>)}
            </div>}
          {post.post_status === 'matched' && <p className="mt-3 rounded-xl bg-live/20 px-3 py-2 text-xs font-semibold">Request accepted{post.accepted_name ? ' for ' + post.accepted_name : ''}. Agree on a public meeting place.</p>}
          {post.post_status === 'matched' && <button type="button" onClick={() => actions.openMessages('scheduled',post.post_id)} className="press mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-bold text-primary-foreground">Message {post.is_mine ? post.accepted_name ?? 'your match' : post.author_name}</button>}
          {post.is_mine && post.requests.length > 0 && <div className="mt-3 border-t border-border pt-3">
            <p className="mb-2 text-xs font-bold">{post.pending_count} join {post.pending_count === 1 ? 'request' : 'requests'}</p>
            {post.requests.map((request) => <div key={request.user_id} className="flex items-center justify-between gap-2 py-1">
              <span className="min-w-0 truncate text-sm font-semibold">{request.name}</span>
              <div className="flex gap-1">
                <button type="button" disabled={workingId === post.post_id} onClick={() => void respond(post.post_id, request.user_id, false)} className="press min-h-11 rounded-xl bg-muted px-3 text-xs font-bold disabled:opacity-50">Reject</button>
                <button type="button" disabled={workingId === post.post_id} onClick={() => void respond(post.post_id, request.user_id, true)} className="press min-h-11 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-50">Accept</button>
              </div>
            </div>)}
          </div>}
          <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3">
            {post.is_mine && <p className="text-xs font-semibold text-muted-foreground">{post.post_status === 'matched' ? 'Invite filled' : post.pending_count > 0 ? 'Review join requests' : 'Waiting for join requests'}</p>}
            {post.is_mine ? <button type="button" onClick={() => setConfirmCancel(post.post_id)} className="press inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-2 text-xs font-bold text-destructive">
              <Trash2 className="size-4" aria-hidden="true" /> Remove
            </button> : post.post_status === 'open' ? (post.request_status ? <span className="text-xs font-semibold">{post.request_status === 'pending' ? 'Request pending' : 'Request declined'}</span> : <PrimaryButton onClick={() => void requestJoin(post.post_id)} disabled={workingId === post.post_id} className="h-12 w-full text-sm">Request to join <ArrowUpRight className="size-4" aria-hidden="true" /></PrimaryButton>) : <button type="button" onClick={() => setConfirmCancel(post.post_id)} className="press min-h-11 text-xs font-bold text-destructive">Cancel meetup</button>}
          </div>
          </div>
        </li>
      })}
    </ul>
    {hasMore && <button type="button" disabled={loading} onClick={() => void loadPage(cursor, false, filter)} className="press min-h-12 rounded-2xl bg-muted font-display font-bold disabled:opacity-50">{loading ? 'Loading...' : 'Show more'}</button>}
    {confirmCancel && <CancellationWarning paired={posts.find(post=>post.post_id===confirmCancel)?.post_status==='matched'} onKeep={() => setConfirmCancel(null)} onCancel={() => { const post=posts.find(item=>item.post_id===confirmCancel); if(post)void cancelPost(post.post_id,post.post_status==='matched') }} />}
  </section>
}
