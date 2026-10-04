'use client'

import { Clock, Footprints, SearchX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { INTENTS, OPEN_UPCATCHES, intentById, sharedInterests, venueById, type IntentId, type OpenUpCatch } from '@/lib/upcatch-data'
import { cn } from '@/lib/utils'
import { useUpCatch } from './app-provider'
import { Chip, LiveDots, PersonAvatar, PrimaryButton, Skeleton } from './primitives'

export function DiscoverScreen() {
  const [filter, setFilter] = useState<IntentId | 'all'>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const t = window.setTimeout(() => setLoading(false), 700)
    return () => window.clearTimeout(t)
  }, [filter])

  const list = filter === 'all' ? OPEN_UPCATCHES : OPEN_UPCATCHES.filter((o) => o.intent === filter)

  return (
    <main className="absolute inset-0 z-20 flex flex-col bg-background animate-in fade-in duration-200">
      <header className="flex flex-col gap-3 bg-background px-5 pt-[max(env(safe-area-inset-top),1.25rem)] pb-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold">Discover</h1>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LiveDots className="text-live" /> Open UpCatches within 1 km, right now
          </p>
        </div>
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 no-scrollbar">
          <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
            All
          </Chip>
          {INTENTS.map((i) => {
            const Icon = i.icon
            return (
              <Chip key={i.id} active={filter === i.id} onClick={() => setFilter(i.id)}>
                <Icon className="size-4" aria-hidden="true" /> {i.label}
              </Chip>
            )
          })}
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pt-1 pb-28">
        {loading ? (
          [0, 1].map((k) => (
            <div key={k} className="shrink-0 overflow-hidden rounded-3xl bg-card" aria-hidden="true">
              <Skeleton className="h-32 rounded-none" />
              <div className="flex flex-col gap-2 p-4">
                <Skeleton className="h-4 w-1/2 rounded-full" />
                <Skeleton className="h-3 w-3/4 rounded-full" />
                <Skeleton className="mt-2 h-12 rounded-2xl" />
              </div>
            </div>
          ))
        ) : list.length === 0 ? (
          <EmptyState />
        ) : (
          list.map((o) => <OpenCard key={o.id} open={o} />)
        )}
      </div>
    </main>
  )
}

function OpenCard({ open }: { open: OpenUpCatch }) {
  const { state, actions } = useUpCatch()
  const [pending, setPending] = useState(false)
  const venue = venueById(open.venueId)
  const intent = intentById(open.intent)
  const shared = sharedInterests(state.user.interests, open.host.interests)
  const Icon = intent.icon
  const busy = state.phase === 'hosting' || state.phase === 'live' || state.phase === 'arrived'

  return (
    <article className="shrink-0 overflow-hidden rounded-3xl bg-card animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="relative h-32">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={venue.image || '/placeholder.svg'} alt={venue.name} className="size-full object-cover" />
        <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-live px-3 py-1.5 text-sm font-bold text-live-foreground">
          <Icon className="size-4" aria-hidden="true" /> {intent.label}
        </span>
        <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-foreground/85 px-3 py-1.5 text-xs font-bold text-background">
          <Clock className="size-3.5" aria-hidden="true" /> in {open.startsInMin} min
        </span>
        <span className="absolute bottom-3 left-3 rounded-full bg-card/95 px-3 py-1 text-xs font-bold">{venue.name}</span>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <PersonAvatar photo={open.host.photo} initials={open.host.initials} size={48} />
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg leading-tight font-extrabold">
              {open.host.name} <span className="font-sans text-sm font-normal text-muted-foreground">{open.host.age}</span>
            </p>
            <p className="truncate text-sm text-muted-foreground">&ldquo;{open.note}&rdquo;</p>
          </div>
          <span className="rounded-full bg-live/25 px-2.5 py-1 font-display text-sm font-extrabold">{open.host.compatibility}%</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {shared.map((s) => (
            <Chip key={s} highlight className="min-h-7 px-2.5 text-xs">
              {s}
            </Chip>
          ))}
          <span className="ml-auto inline-flex items-center gap-1 font-semibold text-muted-foreground">
            <Footprints className="size-3.5" aria-hidden="true" /> {venue.walkMin} min · {open.durationMin} min meet
          </span>
        </div>
        <PrimaryButton
          disabled={pending || busy}
          onClick={() => {
            setPending(true)
            window.setTimeout(
              () =>
                actions.joinOpen({
                  person: open.host,
                  venueId: open.venueId,
                  intent: open.intent,
                  durationMin: open.durationMin,
                  startsInMin: open.startsInMin,
                }),
              1800,
            )
          }}
          className={cn('h-14 w-full text-base', pending && 'opacity-100')}
          variant={pending ? 'ink' : 'primary'}
        >
          {pending ? (
            <>
              Waiting for {open.host.name} <LiveDots />
            </>
          ) : (
            'Ask to join'
          )}
        </PrimaryButton>
      </div>
    </article>
  )
}

function EmptyState() {
  const { actions } = useUpCatch()
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
      <span className="grid size-20 place-items-center rounded-full bg-muted">
        <SearchX className="size-8 text-muted-foreground" aria-hidden="true" />
      </span>
      <div>
        <h2 className="font-display text-xl font-extrabold">Nothing like that nearby yet</h2>
        <p className="mt-1 leading-relaxed text-pretty text-muted-foreground">Be the first — people nearby get notified instantly.</p>
      </div>
      <PrimaryButton onClick={actions.openCreate} className="w-full">
        Create an UpCatch
      </PrimaryButton>
    </div>
  )
}
