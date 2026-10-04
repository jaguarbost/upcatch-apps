'use client'

import { Car, Clock, Footprints, MapPin, Star } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { clockIn, intentById, sharedInterests, venueById, type Offer } from '@/lib/upcatch-data'
import { useUpCatch, useVenueLookup } from './app-provider'
import { Chip, CountdownRing, PersonAvatar, PrimaryButton, Verified } from './primitives'

const WINDOW_SECONDS = 20

export function IncomingCard({ offer }: { offer: Offer }) {
  const { state, actions } = useUpCatch()
  const lookupVenue=useVenueLookup()
  const windowSeconds=state.live ? 30 : WINDOW_SECONDS
  const deadline=state.liveMatch?.proposal_expires_at
  const matchId=state.liveMatch?.id
  const live=Boolean(state.live)
  const latestActions=useRef(actions)
  useEffect(()=>{latestActions.current=actions},[actions])
  const [left, setLeft] = useState(() => deadline ? Math.max(0,Date.parse(deadline)-Date.now()) : windowSeconds * 1000)
  const expired = useRef(false)
  const venue = lookupVenue(offer.venueId)
  const intent = intentById(offer.intent)
  const shared = sharedInterests(state.user.interests, offer.person.interests)
  const [startLabel] = useState(() => clockIn(offer.startsInMin))

  useEffect(() => {
    const started = Date.now()
    expired.current=false
    const tick=()=>{
      const remaining=deadline ? Date.parse(deadline)-Date.now() : WINDOW_SECONDS*1000-(Date.now()-started)
      setLeft(Math.max(0,remaining))
      if(remaining<=0&&!expired.current){
        expired.current=true
        // Ask the server to expire the offer. A late timer must never cancel a confirmed meetup.
        if(live)void latestActions.current.refreshFriends().catch(()=>{})
        else latestActions.current.passOffer()
      }
    }
    tick()
    const timer=window.setInterval(tick,100)
    return()=>window.clearInterval(timer)
  },[deadline,matchId,live])

  const fraction=Math.min(1,Math.max(0,left/(windowSeconds*1000)))
  const Icon = intent.icon

  return (
    <article
      className="pointer-events-auto rounded-[2rem] bg-card p-4 shadow-2xl shadow-foreground/25 animate-in slide-in-from-bottom-12 fade-in duration-300"
      aria-live="assertive"
      aria-label={`Incoming UpCatch from ${offer.person.name}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-live" />
            <span className="relative inline-flex size-2.5 rounded-full bg-live" />
          </span>
          <p className="text-sm font-bold">New UpCatch nearby</p>
        </div>
        <CountdownRing fraction={fraction} seconds={Math.ceil(left / 1000)} size={44} />
      </div>

      <div className="mt-3 flex items-center gap-4">
        <PersonAvatar photo={offer.person.photo} initials={offer.person.initials} size={68} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-baseline gap-2">
            <h2 className="font-display text-2xl font-extrabold">{offer.person.name}</h2>
            <span className="text-muted-foreground">{state.live ? '18+' : offer.person.age}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Verified label={state.live ? 'Email confirmed' : 'ID verified'} />
            <span className="inline-flex items-center gap-1 font-semibold">
              <Star className="size-3.5 fill-live text-live" aria-hidden="true" />
              {state.live ? (offer.person.ratingReceived == null ? String.fromCharCode(8212) : offer.person.ratingReceived.toFixed(1)) : offer.person.rating.toFixed(1)}
            </span>
            <span className="text-muted-foreground">{state.live ? 'Nearby' : '~'+offer.person.distanceKm+' km away'}</span>
            <span className="text-muted-foreground">Show-up {state.live ? (offer.person.showUpPercent == null ? '?' : offer.person.showUpPercent+'%') : '98%'}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3 rounded-2xl bg-foreground p-3 text-background">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-live text-live-foreground">
          <Icon className="size-6" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg leading-tight font-bold">
            {intent.label} · {offer.durationMin} min
          </p>
          <p className="flex items-center gap-1 text-sm opacity-75">
            <Clock className="size-3.5" aria-hidden="true" /> Starts {startLabel}
          </p>
        </div>
      </div>

      {!state.live && <div className="mt-2 flex items-center gap-3 rounded-2xl bg-muted p-2 pr-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={venue.image || '/placeholder.svg'} alt="" className="size-12 rounded-xl object-cover" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 truncate font-semibold">
            <MapPin className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
            {venue.name}
          </p>
          <p className="text-xs text-muted-foreground">{venue.kindLabel} · {venue.verified ? 'reviewed public venue' : 'public venue'}</p>
        </div>
        <div className="flex flex-col items-end text-xs font-semibold">
          <span className="inline-flex items-center gap-1">
            <Footprints className="size-3.5" aria-hidden="true" /> {state.live ? '—' : venue.walkMin+' min'}
          </span>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Car className="size-3.5" aria-hidden="true" /> {state.live ? '—' : venue.driveMin+' min'}
          </span>
        </div>
      </div>

      }
      {shared.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground">You both like</span>
          {shared.map((s) => (
            <Chip key={s} highlight className="min-h-7 px-2.5 text-xs">
              {s}
            </Chip>
          ))}
        </div>
      )}

      <p className="mt-3 text-sm leading-relaxed text-pretty text-muted-foreground">&ldquo;{offer.note}&rdquo;</p>

      <div className="mt-4 flex gap-3">
        <PrimaryButton variant="soft" onClick={actions.passOffer} className="w-28">
          Pass
        </PrimaryButton>
        <button
          type="button"
          onClick={() => actions.acceptOffer(offer)}
          disabled={left<=0||Boolean(state.liveMatch?.accepted)}
          className="press relative flex h-16 flex-1 items-center justify-center overflow-hidden rounded-2xl bg-primary font-display text-lg font-bold text-primary-foreground shadow-lg shadow-primary/30"
        >
          <span
            className="absolute inset-y-0 left-0 bg-primary-foreground/15"
            style={{ width: `${fraction * 100}%`, transition: 'width 100ms linear' }}
            aria-hidden="true"
          />
          <span className="relative">{state.liveMatch?.accepted ? 'Waiting…' : 'Accept'}</span>
        </button>
      </div>
    </article>
  )
}
