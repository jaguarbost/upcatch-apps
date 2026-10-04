'use client'

import { CalendarPlus, CalendarCheck2, LoaderCircle, MessageCircle, Zap } from 'lucide-react'
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
          'press relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        <span className={cn('grid h-8 w-12 place-items-center rounded-full transition-colors', active && 'bg-muted')}>
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
        {item('messages', 'Messages', <MessageCircle className="size-5" aria-hidden="true" />)}
        <button type="button" onClick={()=>{actions.setTab('map');actions.openCreate()}} aria-label="Create meetup" className="press relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold text-muted-foreground">
          <span className="grid h-8 w-12 place-items-center rounded-full"><CalendarPlus className="size-5" aria-hidden="true" /></span>
          Create
        </button>

        <div className="flex flex-1 justify-center">
          <div
            role="status"
            aria-label={state.availabilityBusy ? 'Updating availability' : online ? 'Online' : 'Offline'}
            className={cn(
              '-mt-7 mb-1 flex size-16 flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-bold shadow-xl ring-4 ring-card transition-colors',
              online ? 'bg-live text-live-foreground shadow-live/40' : 'bg-primary text-primary-foreground shadow-primary/40',
            )}
          >
            {state.availabilityBusy ? <LoaderCircle className="size-6 animate-spin" aria-hidden="true" /> : <Zap className="size-6" strokeWidth={2.5} aria-hidden="true" fill={online ? "currentColor" : "none"} />}
            {state.availabilityBusy ? 'Wait...' : online ? 'Online' : 'Offline'}
          </div>
        </div>

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
