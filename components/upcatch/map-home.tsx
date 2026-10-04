'use client'

import { Coffee, LoaderCircle, LocateFixed, UtensilsCrossed, Wine } from 'lucide-react'
import { useEffect, useState } from 'react'
import { LearnMoreButton } from './how-it-works'
import { PEOPLE } from '@/lib/upcatch-data'
import { cn } from '@/lib/utils'
import { useUpCatch } from './app-provider'
import { BrandBadge } from './brand-badge'
import { IncomingCard } from './incoming-card'
import { LiveDots, Switch } from './primitives'

const FREE_OPTIONS = [
  { minutes: 30, label: 'Coffee', icon: Coffee },
  { minutes: 60, label: 'Dine', icon: UtensilsCrossed },
  { minutes: 120, label: 'Drinks', icon: Wine },
]

export function MapTopBar({ children }: { children?: React.ReactNode }) {
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-4 pt-[max(env(safe-area-inset-top),1rem)]">
      <BrandBadge />
      {children}
    </header>
  )
}

export function MapHome() {
  const { state, actions } = useUpCatch()
  const free = state.phase === 'free'
  // Requested display count; never used for real matching/account data.
  const [nearbyCount, setNearbyCount] = useState(12)
  useEffect(() => {
    const key = 'upcatch:display-nearby-count'
    let count = Math.floor(Math.random() * 16) + 5
    try {
      const saved = Number(sessionStorage.getItem(key))
      if (Number.isInteger(saved) && saved >= 5 && saved <= 20) count = saved
      else sessionStorage.setItem(key, String(count))
    } catch {}
    setNearbyCount(count)
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      setNearbyCount(previous => {
        const next = previous >= 20 ? 19 : previous <= 5 ? 6 : previous + (Math.random() < 0.5 ? -1 : 1)
        try { sessionStorage.setItem(key, String(next)) } catch {}
        return next
      })
    }, 7000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <MapTopBar>
        <button
          type="button"
          aria-label="Recenter map"
          onClick={actions.recenterMap}
          className="press pointer-events-auto mr-14 grid size-12 place-items-center rounded-full bg-card/95 shadow-lg shadow-foreground/10 backdrop-blur"
        >
          <LocateFixed className="size-5" aria-hidden="true" />
        </button>
      </MapTopBar>

      <div className="pointer-events-auto absolute top-24 left-4 flex items-center gap-2 rounded-full bg-foreground py-1.5 pr-3.5 pl-1.5 text-background shadow-lg">
        <div className="flex" aria-label="Demo profile photos">
          {PEOPLE.slice(0, 3).map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={p.id} src={p.photo || '/placeholder.svg'} alt="" className="-ml-2 size-7 rounded-full border-2 border-foreground object-cover blur-[1px] first:ml-0" />
          ))}
        </div>
        <p className="text-sm font-semibold">
          <span className="text-live">{nearbyCount}</span> people nearby are free
        </p>
      </div>

      <div className={cn('uc-map-panel absolute inset-x-0 flex flex-col gap-3 px-3', state.incoming ? 'bottom-24' : 'bottom-32')}>
        {state.live && !state.incoming && <div className="pointer-events-auto self-end"><LearnMoreButton /></div>}
        {state.incoming ? (
          <IncomingCard key={state.incoming.person.id} offer={state.incoming} />
        ) : (
          <section
            className={cn(
              'pointer-events-auto rounded-[2rem] bg-card p-5 shadow-2xl shadow-foreground/20 transition-shadow duration-500',
              free && 'ring-4 ring-live',
            )}
            aria-label="Availability"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 className="font-display text-3xl leading-none font-extrabold">
                  {free ? 'You’re free' : 'I’m free now'}
                </h2>
                <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
                  {state.availabilityBusy ? (
                    <><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />{free ? 'Going offline...' : 'Going online...'}</>
                  ) : free ? (
                    <><LiveDots className="text-foreground" />Finding people nearby</>
                  ) : 'Go visible to verified people nearby'}
                </p>
              </div>
              <Switch checked={free} onChange={actions.setFree} label="I’m free now" size="lg" disabled={state.availabilityBusy} />
            </div>

            <div className="mt-4 flex items-center gap-2">
              <span className="text-sm font-semibold text-muted-foreground">For</span>
              <div className="flex flex-1 gap-1 rounded-2xl bg-muted p-1" role="radiogroup" aria-label="Free for">
                {FREE_OPTIONS.map((m) => (
                  <button
                    key={m.minutes}
                    type="button"
                    role="radio"
                    aria-checked={state.freeForMin === m.minutes}
                    onClick={() => actions.setFreeForMin(m.minutes)}
                    className={cn(
                      'press flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-sm font-bold transition-colors',
                      state.freeForMin === m.minutes ? 'bg-card shadow-sm' : 'text-muted-foreground',
                    )}
                  >
                    <m.icon className="size-4" aria-hidden="true" />
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <span className="text-sm font-semibold text-muted-foreground">With</span>
              <div className="flex flex-1 gap-1 rounded-2xl bg-muted p-1" role="radiogroup" aria-label="Available to">
                {(['friends','public','both'] as const).map(value=><button key={value} type="button" role="radio" aria-checked={state.audience===value} onClick={()=>actions.setAudience(value)} className={cn('press min-h-11 flex-1 rounded-xl text-sm font-bold transition-colors',state.audience===value?'bg-card shadow-sm':'text-muted-foreground')}>{value==='friends'?'Friends':value==='public'?'Public':'Both'}</button>)}
              </div>
            </div>

            {free && (
              <div className="mt-4 flex flex-col gap-2" aria-hidden="true">
                <div className="flex items-center gap-3">
                  <span className="uc-skeleton size-10 rounded-full" />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <span className="uc-skeleton h-3 w-2/3 rounded-full" />
                    <span className="uc-skeleton h-3 w-1/3 rounded-full" />
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
