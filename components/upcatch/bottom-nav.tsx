'use client'

import { CalendarCheck2, LayoutGrid, LoaderCircle, MessageCircle, Send, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUpCatch, type Tab } from './app-provider'

export function BottomNav() {
  const { state, actions } = useUpCatch()
  const free = state.phase === 'free'
  const busy = state.phase === 'hosting' || state.phase === 'live' || state.phase === 'arrived'
  const online = free || busy

  const item = (tab: Tab, label: string, icon: React.ReactNode, extra?: React.ReactNode) => {
    const active = state.tab === tab
    return (
      <button
        type="button"
        onClick={() => actions.setTab(tab)}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'press relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[10px] font-semibold min-[375px]:text-[11px]',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        <span className={cn('grid h-8 w-10 place-items-center rounded-full transition-colors min-[375px]:w-12', active && 'bg-muted')}>
          {icon}
        </span>
        {label}
        {extra}
      </button>
    )
  }

  return (
    <nav
      aria-label="Primary"
      className="pb-safe absolute inset-x-0 bottom-0 z-30 rounded-t-[1.75rem] border-t border-border/60 bg-card/95 px-2 pt-1.5 backdrop-blur-xl"
    >
      <div className="flex items-end">
        {item('wall', 'Wall', <LayoutGrid className="size-5" aria-hidden="true" />)}
        {item('messages', 'Messages', <MessageCircle className="size-5" aria-hidden="true" />)}

        <div className="flex min-w-0 flex-1 justify-center">
          <button
            type="button"
            onClick={() => actions.setTab('map')}
            aria-label={state.availabilityBusy ? 'Go to availability, updating' : online ? 'Go to availability, online' : 'Go to availability, offline'}
            className={cn(
              '-mt-7 mb-1 flex size-16 flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-bold shadow-xl ring-4 ring-card transition-colors',
              online ? 'bg-live text-live-foreground shadow-live/40' : 'bg-primary text-primary-foreground shadow-primary/40',
            )}
          >
            {state.availabilityBusy ? <LoaderCircle className="size-6 animate-spin" aria-hidden="true" /> : <Zap className="size-6" strokeWidth={2.5} aria-hidden="true" fill={online ? "currentColor" : "none"} />}
            {state.availabilityBusy ? 'Wait...' : online ? 'Online' : 'Offline'}
          </button>
        </div>

        {item('nudges', 'Nudge', <Send className="size-5" aria-hidden="true" />)}
        {item('meetups', 'Meetups', <CalendarCheck2 className="size-5" aria-hidden="true" />)}
        {item(
          'profile',
          'Profile',
          // eslint-disable-next-line @next/next/no-img-element
          <img src={state.user.photo ?? '/placeholder-user.jpg'} alt="" className="size-6 rounded-full object-cover" />,
        )}
      </div>
    </nav>
  )
}
