'use client'

import { ArrowLeft, Star } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { Person } from '@/lib/upcatch-data'
import { Chip, CountdownRing, PersonAvatar, PrimaryButton, Verified } from './primitives'

export function RequestProfile({ person, live, seconds, fraction, returnLabel = 'Back to request', onClose }: {
  person: Person; live: boolean; seconds?: number; fraction?: number; returnLabel?: string; onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  const rating = live ? person.ratingReceived : person.rating
  const showUp = live ? person.showUpPercent : null

  return <dialog ref={dialog} onClose={onClose} aria-labelledby="request-profile-name"
    className="pointer-events-auto fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-[440px] overflow-y-auto rounded-[2rem] border border-border bg-background p-5 text-foreground shadow-2xl backdrop:bg-black/60">
    <header className="flex items-center justify-between gap-3">
      <button type="button" onClick={onClose} autoFocus className="press flex min-h-11 items-center gap-2 rounded-full bg-card px-3 text-sm font-bold"><ArrowLeft className="size-4" aria-hidden="true" /> {returnLabel}</button>
      {fraction !== undefined && seconds !== undefined && <CountdownRing fraction={fraction} seconds={seconds} size={44} />}
    </header>
    <div className="mt-5 flex flex-col items-center gap-3 text-center">
      <PersonAvatar photo={person.photo} initials={person.initials} size={112} />
      <h2 id="request-profile-name" className="font-display text-3xl font-extrabold">{person.name}</h2>
      <p className="text-sm text-muted-foreground">{person.age > 0 ? `${person.age} years old` : '18+'}</p>
      <Verified label={live ? 'Email confirmed' : 'ID verified'} />
    </div>
    <section aria-label="Meetup stats" className="mt-5 grid grid-cols-2 gap-3">
      <div className="rounded-2xl bg-card p-4 text-center"><p className="flex items-center justify-center gap-1 font-display text-xl font-bold"><Star className="size-4 fill-live text-live" aria-hidden="true" />{rating == null ? '—' : rating.toFixed(1)}</p><p className="mt-1 text-xs text-muted-foreground">Meetup rating</p></div>
      <div className="rounded-2xl bg-card p-4 text-center"><p className="font-display text-xl font-bold">{showUp == null ? '—' : `${showUp}%`}</p><p className="mt-1 text-xs text-muted-foreground">Show-up</p></div>
    </section>
    <section className="mt-5 min-h-24 rounded-2xl bg-card p-4" aria-label="Bio">
      <h3 className="font-display text-lg font-bold">Bio</h3>
    </section>
    <section className="mt-5 rounded-2xl bg-card p-4" aria-label="Interests">
      <h3 className="font-display text-lg font-bold">Interests</h3>
      <div className="mt-3 flex flex-wrap gap-2">{person.interests.length ? person.interests.map(interest => <Chip key={interest}>{interest}</Chip>) : <p className="text-sm text-muted-foreground">No interests shared yet.</p>}</div>
    </section>
    {seconds !== undefined && <p className="mt-4 text-center text-xs text-muted-foreground">The request timer continues while you view this profile.</p>}
    <PrimaryButton onClick={onClose} className="mt-4 w-full">{returnLabel}</PrimaryButton>
  </dialog>
}
