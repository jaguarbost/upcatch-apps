'use client'

import { Inbox, Star } from 'lucide-react'
import { useState } from 'react'
import { intentById, venueById } from '@/lib/upcatch-data'
import { cn } from '@/lib/utils'
import { useUpCatch, useVenueLookup } from './app-provider'
import { PersonAvatar, PrimaryButton } from './primitives'
import { RequestCard } from './request-card'

export function ActivityScreen() {
  const { state, actions } = useUpCatch()
  const lookupVenue=useVenueLookup()
  const [view, setView] = useState<'requests' | 'history'>('requests')
  const venue = state.hosting ? lookupVenue(state.hosting.venueId ?? 'kin') : undefined
  const hasRequests = state.requests.length > 0 || !!state.incoming

  return (
    <main className="absolute inset-0 z-20 flex flex-col bg-background animate-in fade-in duration-200">
      <header className="flex flex-col gap-3 px-5 pt-[max(env(safe-area-inset-top),1.25rem)] pb-3">
        <h1 className="font-display text-3xl font-extrabold">Activity</h1>
        <div className="flex gap-1 rounded-2xl bg-muted p-1" role="tablist">
          {(['requests', 'history'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn(
                'press min-h-11 flex-1 rounded-xl text-sm font-bold capitalize',
                view === v ? 'bg-card shadow-sm' : 'text-muted-foreground',
              )}
            >
              {v}
              {v === 'requests' && state.requests.length > 0 && ` (${state.requests.length})`}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-28 [&>*]:shrink-0">
        {view === 'requests' ? (
          hasRequests ? (
            <>
              {state.incoming && (
                <button
                  type="button"
                  onClick={() => actions.setTab('map')}
                  className="press flex items-center gap-3 rounded-3xl bg-foreground p-4 text-left text-background"
                >
                  <PersonAvatar photo={state.incoming.person.photo} initials={state.incoming.person.initials} size={48} />
                  <div className="flex-1">
                    <p className="font-display font-bold">{state.incoming.person.name} invited you</p>
                    <p className="text-sm opacity-70">{intentById(state.incoming.intent).label} · tap to respond on the map</p>
                  </div>
                </button>
              )}
              {state.requests.map((r, i) => (
                <RequestCard key={r.id} request={r} venue={venue} fresh={i === 0} />
              ))}
            </>
          ) : (
            <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
              <span className="grid size-20 place-items-center rounded-full bg-muted">
                <Inbox className="size-8 text-muted-foreground" aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-display text-xl font-extrabold">No requests right now</h2>
                <p className="mt-1 leading-relaxed text-pretty text-muted-foreground">
                  Go free on the map or create an UpCatch — requests land here the second they arrive.
                </p>
              </div>
              <div className="flex w-full gap-2">
                <PrimaryButton
                  variant="live"
                  onClick={() => {
                    actions.setFree(true)
                    actions.setTab('map')
                  }}
                  className="flex-1 text-base"
                >
                  I’m free now
                </PrimaryButton>
                <PrimaryButton onClick={actions.openCreate} className="flex-1 text-base">
                  Create
                </PrimaryButton>
              </div>
            </div>
          )
        ) : (
          <ul className="flex flex-col gap-2">
            {state.history.map((h) => {
              const intent = intentById(h.intent)
              return (
                <li key={h.id} className="flex items-center gap-3 rounded-3xl bg-card p-3 animate-in fade-in">
                  <PersonAvatar photo={h.person.photo} initials={h.person.initials} size={48} />
                  <div className="min-w-0 flex-1">
                    <p className="font-display font-bold">
                      {intent.label} with {h.person.name}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {lookupVenue(h.venueId).name} · {h.when}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 font-display font-extrabold">
                    <Star className="size-4 fill-live text-live" aria-hidden="true" />
                    {h.rating}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </main>
  )
}
