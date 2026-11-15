'use client'

import { Check, Flag, MapPin, Navigation, QrCode, MessageCircle, ShieldAlert, Sparkles, X, Zap } from 'lucide-react'
import { useState } from 'react'
import { intentById } from '@/lib/upcatch-data'
import { cn } from '@/lib/utils'
import { useUpCatch, useVenueLookup } from './app-provider'
import { BottomSheet, PersonAvatar, PrimaryButton } from './primitives'
import { SafetySheet, type SheetKind } from './safety-sheet'
import { RequestProfile } from './request-profile'

export function LiveMeetup() {
  const { state, actions } = useUpCatch()
  const lookupVenue=useVenueLookup()
  const [sheet, setSheet] = useState<SheetKind | null>(null)
  const [signal, setSignal] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const m = state.meetup
  if (!m) return null

  const venue = lookupVenue(m.venueId)
  const intent = intentById(m.intent)
  const arrived = state.phase === 'arrived'
  const partnerHere = state.progress.them >= 1
  const meEta = Math.max(0, Math.ceil(venue.walkMin * (1 - state.progress.me)))
  const themEta = Math.max(0, Math.ceil(m.person.walkMin * (1 - state.progress.them)))
  const themKm = Math.max(0, m.person.distanceKm * (1 - state.progress.them))
  const nearlyThere = !arrived && state.progress.me >= 0.9

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {signal && (
        <button
          type="button"
          onClick={() => setSignal(false)}
          className="pointer-events-auto absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-live text-live-foreground animate-pulse"
        >
          <Zap className="size-20" aria-hidden="true" />
          <span className="font-display text-4xl font-extrabold">{m.person.name}, over here!</span>
          <span className="text-lg font-semibold">Hold up your phone · tap to close</span>
        </button>
      )}

      <div className="uc-journey-header pointer-events-auto absolute inset-x-4 top-[max(env(safe-area-inset-top),1rem)] flex items-center gap-3 rounded-3xl bg-foreground p-3 text-background shadow-xl animate-in fade-in slide-in-from-top-4">
        <span className={cn('grid size-12 shrink-0 place-items-center rounded-2xl', arrived ? 'bg-primary text-primary-foreground' : 'bg-live text-live-foreground')}>
          {arrived ? <Check className="size-6" aria-hidden="true" /> : <Navigation className="size-6" aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1" aria-live="polite">
          <p className="font-display text-lg leading-tight font-bold">
            {arrived ? (partnerHere ? `${m.person.name} is here too` : 'You’ve arrived') : (state.live ? 'You matched with '+m.person.name : `${meEta} min to ${venue.name.split(' ')[0]}`)}
          </p>
          <p className="text-sm opacity-70">
            {intent.label} · {m.startLabel}–{m.endLabel}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSheet('safety')}
          aria-label="Open safety centre"
          className="press flex shrink-0 flex-col items-center gap-1"
        >
          <span className="grid size-11 place-items-center rounded-full bg-destructive text-destructive-foreground"><ShieldAlert className="size-5" aria-hidden="true" /></span>
          <span className="text-[9px] font-semibold leading-none text-destructive">Safety</span>
        </button>
      </div>

      <div className="uc-journey-panel absolute inset-x-0 bottom-20">
        <BottomSheet className="max-h-[68dvh] overflow-y-auto pb-5">
          <div className="flex flex-col gap-3 px-4 pt-3">
            {arrived ? (
              <div className="flex items-center gap-3 rounded-3xl bg-muted p-3 animate-in fade-in zoom-in-95">
                <button type="button" aria-label={`View ${m.person.name} profile`} aria-haspopup="dialog" onClick={() => setProfileOpen(true)} className="press shrink-0 rounded-full focus-visible:ring-2 focus-visible:ring-primary"><PersonAvatar photo={m.person.photo} initials={m.person.initials} size={56} ring={partnerHere} /></button>
                <div className="min-w-0 flex-1">
                  <button type="button" onClick={() => setProfileOpen(true)} className="press text-left font-display text-lg font-extrabold">
                    {partnerHere ? `${m.person.name} has arrived` : (state.live ? 'Waiting for '+m.person.name+' to arrive' : `${m.person.name} is ~${themEta} min away`)}
                  </button>
                  <p className="text-sm text-muted-foreground">{m.person.lookFor}</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 rounded-3xl bg-muted p-3">
                <ProgressRow label="You" photo={state.user.photo} initials="ME" value={state.progress.me} eta={state.live ? -1 : meEta} tone="primary" />
                <ProgressRow
                  onProfile={() => setProfileOpen(true)}
                  label={m.person.name}
                  photo={m.person.photo}
                  initials={m.person.initials}
                  value={state.progress.them}
                  eta={state.live ? -1 : themEta}
                  tone="ink"
                  sub={state.live ? 'Awaiting arrival confirmation' : `~${themKm.toFixed(1)} km from venue`}
                />
              </div>
            )}

            {state.live ? <p className="rounded-3xl bg-muted p-3 text-sm text-muted-foreground">Open Messages to say hello and agree on a public meeting spot together.</p> : <div className="flex items-center gap-3 rounded-3xl border border-border p-2 pr-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={venue.image || '/placeholder.svg'} alt={venue.name} className="size-16 rounded-2xl object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display font-bold">{venue.name}</p>
                <p className="flex items-center gap-1 truncate text-sm text-muted-foreground">
                  <MapPin className="size-3.5 shrink-0" aria-hidden="true" /> {venue.address}
                </p>
                <p className="truncate text-xs font-semibold text-primary">{venue.safety}</p>
              </div>
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(`${venue.name} ${venue.address}`)}`}
                target="_blank"
                rel="noreferrer"
                aria-label="Directions to venue"
                className="press grid size-11 place-items-center rounded-full bg-primary/10 text-primary"
              >
                <Navigation className="size-5" aria-hidden="true" />
              </a>
            </div>}

            {arrived ? (
              <div className={state.live ? "flex flex-col gap-2" : "grid grid-cols-2 gap-2"}>
                <PrimaryButton variant="live" onClick={() => setSignal(true)} className="h-14 text-base">
                  <Sparkles className="size-5" aria-hidden="true" /> Flash signal
                </PrimaryButton>
                {state.live ? <p className="rounded-2xl bg-muted p-3 text-center text-sm font-semibold text-muted-foreground" role="status">Feedback opens when your meetup ends.</p> : <PrimaryButton onClick={actions.endMeetup} disabled={!partnerHere} className="h-14 text-base">We met!</PrimaryButton>}
              </div>
            ) : (
              <PrimaryButton onClick={actions.imHere} className={cn('w-full', nearlyThere && 'animate-pulse')}>
                <MapPin className="size-5" aria-hidden="true" />
                {nearlyThere ? 'Looks like you’re here — tap' : 'I’m here'}
              </PrimaryButton>
            )}

            <PrimaryButton onClick={() => actions.openMessages('live')} className="h-16 w-full text-lg">
              <MessageCircle className="size-6" aria-hidden="true" /> Msgs {state.messages.length}
            </PrimaryButton>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSheet('cancel')}
                className="press flex min-h-12 items-center justify-center gap-1.5 rounded-2xl bg-muted text-sm font-bold"
              >
                <X className="size-4" aria-hidden="true" /> Cancel
              </button>
              <button
                type="button"
                onClick={() => setSheet('report')}
                className="press flex min-h-12 items-center justify-center gap-1.5 rounded-2xl bg-muted text-sm font-bold"
              >
                <Flag className="size-4" aria-hidden="true" /> Report
              </button>
            </div>
            <PrimaryButton variant="live" onClick={() => actions.openFriends('show', m.person)} className="min-h-20 w-full justify-between gap-4 px-4 text-left">
              <span className="text-sm leading-snug">Become friends to stay connected for future UpCatches.</span>
              <QrCode className="size-8 shrink-0" aria-hidden="true" />
            </PrimaryButton>
          </div>
        </BottomSheet>
      </div>

      {profileOpen && <RequestProfile person={m.person} live={Boolean(state.live)} returnLabel="Back to meetup" onClose={() => setProfileOpen(false)} />}
      {sheet && (
        <div className="pointer-events-auto">
          <SafetySheet kind={sheet} partnerName={m.person.name} onClose={() => setSheet(null)} />
        </div>
      )}
    </div>
  )
}

function ProgressRow({
  label,
  photo,
  initials,
  value,
  eta,
  tone,
  sub,
  onProfile,
}: {
  label: string
  photo: string | null
  initials: string
  value: number
  eta: number
  tone: 'primary' | 'ink'
  onProfile?: () => void
  sub?: string
}) {
  return (
    <div className="flex items-center gap-3">
      {onProfile ? <button type="button" onClick={onProfile} aria-label={`View ${label} profile`} aria-haspopup="dialog" className="press shrink-0 rounded-full focus-visible:ring-2 focus-visible:ring-primary"><PersonAvatar photo={photo} initials={initials} size={40} /></button> : <PersonAvatar photo={photo} initials={initials} size={40} />}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between">
          {onProfile ? <button type="button" onClick={onProfile} className="press text-left font-bold">{label}</button> : <p className="font-bold">{label}</p>}
          <p className="font-display text-sm font-extrabold tabular-nums">{value >= 1 ? 'Arrived' : eta<0 ? 'On the way' : `${eta} min`}</p>
        </div>
        <div
          className="mt-1 h-2.5 overflow-hidden rounded-full bg-card"
          role="progressbar"
          aria-label={`${label} progress to venue`}
          aria-valuenow={Math.round(value * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={cn('h-full rounded-full transition-[width] duration-500 ease-out', tone === 'primary' ? 'bg-primary' : 'bg-foreground')}
            style={{ width: `${Math.max(6, value * 100)}%` }}
          />
        </div>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  )
}
