'use client'

import { CalendarClock, Compass, Hourglass, MapPin, Star } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { intentById, venueById } from '@/lib/upcatch-data'
import { cn } from '@/lib/utils'
import { useUpCatch, useVenueLookup } from './app-provider'
import { PersonAvatar, PrimaryButton } from './primitives'

const TABS = ['active', 'upcoming', 'past'] as const
type MeetupTab = (typeof TABS)[number]

export function MeetupsScreen() {
  const { state, actions } = useUpCatch()
  const lookupVenue=useVenueLookup()
  const [view, setView] = useState<MeetupTab>('active')

  const inJourney = state.phase === 'live' || state.phase === 'arrived'
  const isHosting = state.phase === 'hosting'
  const hasActive = inJourney || isHosting || state.phase==='free'

  return (
    <main className="absolute inset-0 z-20 flex flex-col bg-background animate-in fade-in duration-200">
      <header className="flex flex-col gap-3 px-5 pt-[max(env(safe-area-inset-top),1.25rem)] pb-3 lg:mx-auto lg:w-full lg:max-w-xl">
        <h1 className="font-display text-3xl font-extrabold">My meetups</h1>
        <div className="flex gap-1 rounded-2xl bg-muted p-1" role="tablist">
          {TABS.map((v) => (
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
              {v === 'active' && hasActive && ' (1)'}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-28 [&>*]:shrink-0 lg:mx-auto lg:w-full lg:max-w-xl">
        {view === 'active' &&
          (hasActive ? (
            <button
              type="button"
              onClick={() => actions.setTab('map')}
              className="press flex items-center gap-3 rounded-3xl bg-foreground p-4 text-left text-background"
            >
              {inJourney && state.meetup ? (
                <>
                  <PersonAvatar photo={state.meetup.person.photo} initials={state.meetup.person.initials} size={52} ring />
                  <div className="min-w-0 flex-1">
                    <p className="font-display font-bold">
                      {intentById(state.meetup.intent).label} with {state.meetup.person.name}
                    </p>
                    <p className="truncate text-sm opacity-70">
                      {state.live ? (state.creationType==='manual'?'Manual':'Auto')+' · ' : ''}{lookupVenue(state.meetup.venueId).name} · {state.phase === 'arrived' ? 'Arrived' : 'On the way'}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <span className="grid size-12 shrink-0 place-items-center rounded-full bg-live text-live-foreground">
                    <Hourglass className="size-6" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-display font-bold">{state.incoming ? 'Your meetup offer' : state.creationType==='manual' ? 'Your created meetup is live' : 'Automatic matching is live'}</p>
                    <p className="truncate text-sm opacity-70">
                      {state.requests.length > 0 ? `${state.requests.length} people want to join` : state.incoming ? 'Tap to respond to your offer' : 'Waiting for a compatible online member'}
                    </p>
                  </div>
                </>
              )}
            </button>
          ) : (
            <EmptyMeetups
              icon={<Compass className="size-8 text-muted-foreground" aria-hidden="true" />}
              title="Nothing active"
              body="Go online or create an UpCatch — it’ll show up here the moment it starts."
              action
            />
          ))}

        {view === 'upcoming' && (
          <EmptyMeetups
            icon={<CalendarClock className="size-8 text-muted-foreground" aria-hidden="true" />}
            title="No upcoming meetups"
            body="Accepted invites you haven’t started yet will land here."
          />
        )}

        {view === 'past' &&
          (state.history.length > 0 ? (
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
                        {state.live ? (h.creationType==='manual'?'Manual':'Auto')+' · ' : ''}{lookupVenue(h.venueId).name} · {h.when}
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
          ) : (
            <EmptyMeetups
              icon={<MapPin className="size-8 text-muted-foreground" aria-hidden="true" />}
              title="No past meetups yet"
              body="Your completed UpCatches will show up here."
            />
          ))}
      </div>
    </main>
  )
}

function EmptyMeetups({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: boolean }) {
  const { actions } = useUpCatch()
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
      <span className="grid size-20 place-items-center rounded-full bg-muted">{icon}</span>
      <div>
        <h2 className="font-display text-xl font-extrabold">{title}</h2>
        <p className="mt-1 leading-relaxed text-pretty text-muted-foreground">{body}</p>
      </div>
      {action && (
        <PrimaryButton
          variant="live"
          onClick={() => {
            actions.setFree(true)
            actions.setTab('map')
          }}
          className="w-full text-base"
        >
          I’m free now
        </PrimaryButton>
      )}
    </div>
  )
}
