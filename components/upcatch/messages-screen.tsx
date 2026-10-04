'use client'

import { MessageCircle } from 'lucide-react'
import { useUpCatch } from './app-provider'
import { PersonAvatar } from './primitives'

export function MessagesScreen() {
  const { state, actions } = useUpCatch()
  const hasActive = !!state.meetup
  const lastMsg = state.messages[state.messages.length - 1]
  const hasAny = hasActive || state.history.length > 0

  return (
    <main className="absolute inset-0 z-20 flex flex-col bg-background animate-in fade-in duration-200">
      <header className="px-5 pt-[max(env(safe-area-inset-top),1.25rem)] pb-3">
        <h1 className="font-display text-3xl font-extrabold">Messages</h1>
      </header>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 pb-28 lg:mx-auto lg:w-full lg:max-w-xl">
        {hasActive && state.meetup && (
          <button
            type="button"
            onClick={() => actions.setTab('map')}
            className="press flex items-center gap-3 rounded-3xl bg-card p-3 text-left shadow-sm shadow-foreground/5"
          >
            <PersonAvatar photo={state.meetup.person.photo} initials={state.meetup.person.initials} size={52} ring />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate font-display font-bold">{state.meetup.person.name}</p>
                <span className="rounded-full bg-live px-2 py-0.5 text-[10px] font-bold text-live-foreground">Live</span>
              </div>
              <p className="truncate text-sm text-muted-foreground">{lastMsg ? lastMsg.text : 'Say hi before you meet up'}</p>
            </div>
          </button>
        )}

        {state.history.map((h) => (
          <div key={h.id} className="flex items-center gap-3 rounded-3xl bg-card p-3 opacity-80">
            <PersonAvatar photo={h.person.photo} initials={h.person.initials} size={52} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display font-bold">{h.person.name}</p>
              <p className="truncate text-sm text-muted-foreground">Chat ended · {h.when}</p>
            </div>
          </div>
        ))}

        {!hasAny && (
          <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
            <span className="grid size-20 place-items-center rounded-full bg-muted">
              <MessageCircle className="size-8 text-muted-foreground" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-display text-xl font-extrabold">No messages yet</h2>
              <p className="mt-1 leading-relaxed text-pretty text-muted-foreground">
                Chats with the people you meet will show up here.
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
