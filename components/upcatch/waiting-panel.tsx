'use client'

import { X } from 'lucide-react'
import { useState } from 'react'
import { clockIn, intentById, venueById } from '@/lib/upcatch-data'
import { useUpCatch, useVenueLookup } from './app-provider'
import { MapTopBar } from './map-home'
import { BottomSheet, LiveDots, Skeleton } from './primitives'
import { RequestCard } from './request-card'

export function WaitingPanel() {
  const { state, actions } = useUpCatch()
  const lookupVenue=useVenueLookup()
  const draft = state.hosting
  const [untilLabel] = useState(() => clockIn(draft?.windowMin ?? 60))
  if (!draft) return null
  const intent = intentById(draft.intent ?? 'coffee')
  const venue = lookupVenue(draft.venueId ?? 'kin')
  const Icon = intent.icon
  const count = state.requests.length

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <MapTopBar />

      <div className="uc-journey-header pointer-events-auto absolute inset-x-4 top-24 flex items-center gap-3 rounded-3xl bg-foreground p-3 text-background shadow-xl animate-in fade-in slide-in-from-top-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-live text-live-foreground">
          <Icon className="size-6" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg leading-tight font-bold">
            {intent.label} at {venue.name}
          </p>
          <p className="text-sm opacity-70">
            {draft.durationMin} min · live until {untilLabel} · {draft.radiusKm} km
          </p>
        </div>
        <button
          type="button"
          onClick={actions.cancelHosting}
          aria-label="Cancel this UpCatch"
          className="press grid size-11 shrink-0 place-items-center rounded-full bg-background/15"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>

      <div className="uc-journey-panel absolute inset-x-0 bottom-20">
        <BottomSheet className="max-h-[58dvh] overflow-y-auto pb-6">
          <div className="sticky top-0 z-10 flex items-center justify-between bg-card px-5 pt-3 pb-3">
            <div>
              <h2 className="font-display text-2xl font-extrabold" aria-live="polite">
                {count === 0 ? 'Finding people nearby' : `${count} want${count === 1 ? 's' : ''} to join`}
              </h2>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <LiveDots className="text-primary" />
                {count === 0 ? 'Most UpCatches match in under 2 minutes' : 'Still looking — more may arrive'}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-3 px-4">
            {state.requests.map((r, i) => (
              <RequestCard key={r.id} request={r} venue={venue} fresh={i === 0} />
            ))}
            <SkeletonRequest />
          </div>
        </BottomSheet>
      </div>
    </div>
  )
}

function SkeletonRequest() {
  return (
    <div className="flex items-center gap-3 rounded-3xl border border-dashed border-border p-4" aria-hidden="true">
      <Skeleton className="size-14 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-1/2 rounded-full" />
        <Skeleton className="h-3 w-3/4 rounded-full" />
      </div>
    </div>
  )
}
