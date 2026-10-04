'use client'

import { Globe2, X } from 'lucide-react'
import { useUpCatch } from './app-provider'
import { PersonAvatar } from './primitives'

export function FriendAlert() {
  const { state, actions } = useUpCatch()
  const f = state.friendAlert
  if (!f) return null

  return (
    <div
      role="alert"
      className="absolute inset-x-3 top-[max(env(safe-area-inset-top),0.75rem)] z-[60] flex flex-col gap-3 rounded-3xl bg-card p-3 shadow-2xl ring-2 ring-live animate-in fade-in slide-in-from-top-6 duration-300"
    >
      <div className="flex items-center gap-3">
        <PersonAvatar photo={f.person.photo} initials={f.person.initials} size={48} ring />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-primary uppercase">
            <Globe2 className="size-3.5" aria-hidden="true" /> Friend · any distance
          </p>
          <p className="font-display text-lg leading-tight font-extrabold">{`${f.person.name} is free now`}</p>
          <p className="truncate text-sm text-muted-foreground">{`Up for coffee · ${f.where}`}</p>
        </div>
        <button
          type="button"
          onClick={actions.dismissFriendAlert}
          aria-label="Dismiss"
          className="press grid size-11 shrink-0 place-items-center rounded-full bg-muted"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={actions.dismissFriendAlert}
          className="press min-h-12 rounded-2xl bg-muted font-display font-bold"
        >
          Later
        </button>
        <button
          type="button"
          onClick={() => actions.joinFriend(f)}
          className="press min-h-12 rounded-2xl bg-live font-display font-bold text-live-foreground"
        >
          UpCatch now
        </button>
      </div>
    </div>
  )
}
