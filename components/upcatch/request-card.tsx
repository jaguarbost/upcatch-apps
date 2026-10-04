'use client'

import { BadgeCheck, Footprints, Phone, ScanFace, Star, X } from 'lucide-react'
import { sharedInterests, type Venue } from '@/lib/upcatch-data'
import { cn } from '@/lib/utils'
import { useUpCatch, type JoinRequest } from './app-provider'
import { Chip, PersonAvatar } from './primitives'
import { haptic } from '@/lib/haptics'

export function RequestCard({ request, venue, fresh }: { request: JoinRequest; venue?: Venue; fresh?: boolean }) {
  const { state, actions } = useUpCatch()
  const p = request.person
  const shared = sharedInterests(state.user.interests, p.interests)
  const eta = venue ? Math.max(3, Math.round(p.walkMin * 0.8)) : p.walkMin

  return (
    <article
      className={cn(
        'rounded-3xl border border-border bg-card p-4 animate-in fade-in slide-in-from-top-4 duration-300',
        fresh && 'border-live ring-2 ring-live/40',
      )}
      aria-label={`Join request from ${p.name}`}
    >
      <div className="flex items-center gap-3">
        <PersonAvatar photo={p.photo} initials={p.initials} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h3 className="font-display text-xl font-extrabold">{p.name}</h3>
            <span className="text-sm text-muted-foreground">{p.age}</span>
            <span className="ml-auto inline-flex items-center gap-1 text-sm font-semibold">
              <Star className="size-3.5 fill-live text-live" aria-hidden="true" />
              {p.rating.toFixed(1)}
              <span className="font-normal text-muted-foreground">({p.meetups})</span>
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5" aria-label="Verification">
            <TrustDot on={p.verified.id} icon={<BadgeCheck className="size-3.5" />} label="ID" />
            <TrustDot on={p.verified.photo} icon={<ScanFace className="size-3.5" />} label="Selfie" />
            <TrustDot on={p.verified.phone} icon={<Phone className="size-3.5" />} label="Phone" />
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat value={`${p.compatibility}%`} label="Match" accent />
        <Stat value={`~${p.distanceKm} km`} label="Away" />
        <Stat
          value={
            <span className="inline-flex items-center gap-1">
              <Footprints className="size-4" aria-hidden="true" />
              {eta}m
            </span>
          }
          label="ETA to venue"
        />
      </div>

      {shared.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {shared.map((s) => (
            <Chip key={s} highlight className="min-h-7 px-2.5 text-xs">
              {s}
            </Chip>
          ))}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => actions.rejectRequest(request.id)}
          aria-label={`Reject ${p.name}`}
          className="press grid h-14 w-16 place-items-center rounded-2xl bg-muted"
        >
          <X className="size-6" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => {
            haptic('success')
            actions.acceptRequest(request)
          }}
          className="press flex h-14 flex-1 items-center justify-center rounded-2xl bg-primary font-display text-lg font-bold text-primary-foreground shadow-lg shadow-primary/30"
        >
          Accept {p.name}
        </button>
      </div>
    </article>
  )
}

function TrustDot({ on, icon, label }: { on: boolean; icon: React.ReactNode; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold',
        on ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground line-through',
      )}
    >
      <span aria-hidden="true">{icon}</span>
      {label}
      <span className="sr-only">{on ? ' verified' : ' not verified'}</span>
    </span>
  )
}

function Stat({ value, label, accent }: { value: React.ReactNode; label: string; accent?: boolean }) {
  return (
    <div className={cn('rounded-2xl py-2', accent ? 'bg-live/25' : 'bg-muted')}>
      <p className="font-display text-lg leading-tight font-extrabold">{value}</p>
      <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
    </div>
  )
}
