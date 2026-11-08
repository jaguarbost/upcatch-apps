'use client'

import { Share2, Sparkles, Star } from 'lucide-react'
import { useState } from 'react'
import { haptic } from '@/lib/haptics'
import { intentById, venueById } from '@/lib/upcatch-data'
import { cn } from '@/lib/utils'
import { useUpCatch, useVenueLookup } from './app-provider'
import { Chip, PrimaryButton, Switch } from './primitives'
import { ShareSheet } from './share-sheet'

const TAGS = ['On time', 'Great chat', 'Friendly', 'Just like their photo', 'Would meet again']

export function RatingScreen() {
  const { state, actions } = useUpCatch()
  const lookupVenue=useVenueLookup()
  const [rating, setRating] = useState(0)
  const [met, setMet] = useState<boolean | null>(null)
  const [noShow, setNoShow] = useState(false)
  const [tags, setTags] = useState<string[]>([])
  const [again, setAgain] = useState(true)
  const [sharing, setSharing] = useState(false)
  const m = state.meetup
  const missed = Boolean(state.live && state.feedbackStatus === 'cancelled')
  if (!m) return null

  return (
    <main className="absolute inset-0 z-50 flex flex-col bg-background animate-in fade-in slide-in-from-bottom-8 duration-300">
      <div className="flex flex-1 flex-col items-center gap-6 overflow-y-auto px-6 pt-[max(env(safe-area-inset-top),3rem)] text-center">
        <div className="relative flex items-center pt-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={state.user.photo ?? '/placeholder-user.jpg'} alt="" className="uc-pop size-24 -rotate-6 rounded-full border-4 border-card object-cover shadow-xl" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={m.person.photo || '/placeholder.svg'}
            alt=""
            className="uc-pop -ml-6 size-24 rotate-6 rounded-full border-4 border-card object-cover shadow-xl"
            style={{ animationDelay: '120ms' }}
          />
          <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-live px-3 py-1 font-display text-sm font-extrabold text-live-foreground">
            {missed ? 'Time ended' : 'UpCaught'}
          </span>
        </div>
        <div>
          <h1 className="font-display text-3xl leading-tight font-extrabold text-balance">{missed ? 'Your meetup time has ended' : <>How was your {intentById(m.intent).label.toLowerCase()} with {m.person.name}?</>}</h1>
          <p className="mt-1 text-muted-foreground">
            {state.live ? 'Public venue agreed in chat' : lookupVenue(m.venueId).name} - {m.durationMin} min
          </p>
        </div>

        {missed ? (
          <div className="flex w-full flex-col gap-3 rounded-3xl bg-card p-4 text-left">
            <p className="font-display text-lg font-bold">Did you meet {m.person.name}?</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" aria-pressed={met === true} onClick={() => { setMet(true); setNoShow(false) }} className={cn('press min-h-12 rounded-2xl font-bold', met === true ? 'bg-primary text-primary-foreground' : 'bg-muted')}>We met</button>
              <button type="button" aria-pressed={met === false} onClick={() => setMet(false)} className={cn('press min-h-12 rounded-2xl font-bold', met === false ? 'bg-primary text-primary-foreground' : 'bg-muted')}>We did not meet</button>
            </div>
            {met === false && <div className="flex flex-col gap-2">
              <Chip active={noShow} onClick={() => setNoShow((value) => !value)}>{m.person.name} didn't show up</Chip>
              <p className="text-xs text-muted-foreground">Choose this only if you checked in and they did not arrive.</p>
            </div>}
          </div>
        ) : (
        <div className="flex gap-1" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} star${n > 1 ? 's' : ''}`}
              onClick={() => {
                haptic(n === 5 ? 'success' : 'select')
                setRating(n)
              }}
              className="press grid size-14 place-items-center"
            >
              <Star
                className={cn('size-11 transition-all duration-200', n <= rating ? 'scale-110 fill-live text-live' : 'text-muted-foreground/40')}
                aria-hidden="true"
              />
            </button>
          ))}
        </div>

        )}

        {!missed && rating > 0 && (
          <div className="flex flex-wrap justify-center gap-2 animate-in fade-in slide-in-from-bottom-2">
            {TAGS.map((t) => (
              <Chip key={t} active={tags.includes(t)} onClick={() => setTags((c) => (c.includes(t) ? c.filter((x) => x !== t) : [...c, t]))}>
                {t}
              </Chip>
            ))}
          </div>
        )}

        {!missed && <>
        <button
          type="button"
          onClick={() => {
            haptic('select')
            setSharing(true)
          }}
          className="press flex w-full items-center gap-3 rounded-3xl bg-primary p-4 text-left text-primary-foreground shadow-lg shadow-primary/30"
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-live text-live-foreground" aria-hidden="true">
            <Sparkles className="size-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-lg font-extrabold">Make a Catch Card</span>
            <span className="block text-sm opacity-85">Share the story, keep their face private</span>
          </span>
          <Share2 className="size-5 shrink-0" aria-hidden="true" />
        </button>

        <div className="flex w-full items-center gap-3 rounded-3xl bg-card p-4 text-left">
          <div className="flex-1">
            <p className="font-semibold">UpCatch with {m.person.name} again</p>
            <p className="text-sm text-muted-foreground">We’ll nudge you both next time you’re free nearby</p>
          </div>
          <Switch checked={again} onChange={setAgain} label={`UpCatch with ${m.person.name} again`} />
        </div>
        </>}
      </div>
      <footer className="flex flex-col gap-2 px-6 pt-3 pb-safe">
        <PrimaryButton onClick={() => state.live ? actions.submitFeedback(missed ? null : rating, missed ? met : null, missed && noShow) : actions.submitRating(rating || 5)} disabled={missed ? met === null : !rating} className="w-full">
          Submit
        </PrimaryButton>
        {!state.live && <button type="button" onClick={() => actions.submitRating(5)} className="press mb-2 min-h-11 text-sm font-semibold text-muted-foreground">
          Skip
        </button>}
      </footer>
      {sharing && (
        <ShareSheet
          target={{
            kind: 'meetup',
            person: m.person,
            intentLabel: intentById(m.intent).label,
            venueName: state.live ? 'Public venue agreed in chat' : lookupVenue(m.venueId).name,
            durationMin: m.durationMin,
          }}
          onClose={() => setSharing(false)}
        />
      )}
    </main>
  )
}

export function MatchOverlay() {
  const { state } = useUpCatch()
  const lookupVenue=useVenueLookup()
  const p = state.matchFlash
  if (!p) return null
  return (
    <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center gap-6 bg-primary text-primary-foreground animate-in fade-in duration-200" role="status">
      <div className="relative grid place-items-center">
        <span className="uc-ping is-live" aria-hidden="true" />
        <span className="uc-ping is-live" aria-hidden="true" />
        <div className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={state.user.photo ?? '/placeholder-user.jpg'} alt="" className="uc-pop size-28 rounded-full border-4 border-live object-cover" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.photo || '/placeholder.svg'} alt="" className="uc-pop -ml-8 size-28 rounded-full border-4 border-live object-cover" style={{ animationDelay: '150ms' }} />
        </div>
      </div>
      <div className="text-center">
        <p className="font-display text-5xl font-extrabold">It’s on!</p>
        <p className="mt-2 text-lg opacity-85">You and {p.name} are heading out</p>
      </div>
    </div>
  )
}

export function ScheduledPairOverlay() {
  const { state } = useUpCatch()
  const plan = state.scheduledPlanFlash
  if (!plan) return null
  const initials = plan.partner_name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?'
  return <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center gap-6 bg-primary px-6 text-primary-foreground animate-in fade-in duration-200" role="status">
    <div className="relative grid place-items-center">
      <span className="uc-ping is-live" aria-hidden="true" />
      <span className="uc-ping is-live" aria-hidden="true" />
      <div className="flex items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={state.user.photo ?? '/placeholder-user.jpg'} alt="" className="uc-pop size-28 rounded-full border-4 border-live object-cover" />
        <span className="uc-pop -ml-8 grid size-28 place-items-center rounded-full border-4 border-live bg-card font-display text-3xl font-extrabold text-foreground" style={{ animationDelay: '150ms' }}>{initials}</span>
      </div>
    </div>
    <div className="text-center">
      <p className="font-display text-5xl font-extrabold">It's on!</p>
      <p className="mt-2 text-lg opacity-85">Your invite with {plan.partner_name} is confirmed.</p>
    </div>
  </div>
}
