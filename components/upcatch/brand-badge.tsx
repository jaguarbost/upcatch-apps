'use client'

import { cn } from '@/lib/utils'
import { useUpCatch } from './app-provider'

export function LogoMark({ size = 40, live = false, className }: { size?: number; live?: boolean; className?: string }) {
  return (
    <span className={cn('relative grid shrink-0 place-items-center overflow-hidden rounded-[30%] bg-primary',className)} style={{width:size,height:size}} aria-hidden="true">
      <svg viewBox="0 0 64 64" className="size-full" fill="none">
        <circle cx="18" cy="22" r="5" fill="var(--primary-foreground)" />
        <circle cx="46" cy="22" r="5" fill="var(--primary-foreground)" />
        <path d="M18 35v4c0 8 6 14 14 14s14-6 14-14v-4" stroke="var(--primary-foreground)" strokeWidth="7" strokeLinecap="round" />
      </svg>
    </span>
  )
}

export function BrandBadge() {
  const { state, actions } = useUpCatch()
  const open = true
  const live = state.phase === 'free' || state.phase === 'hosting'

  return (
    <button
      type="button"
      onClick={()=>actions.setTab('map')}
      aria-expanded={open}
      aria-label="UpCatch home"
      className={cn(
        'press pointer-events-auto flex h-14 items-center overflow-hidden rounded-full bg-card/95 p-1.5 text-left shadow-lg shadow-foreground/10 backdrop-blur transition-[max-width,padding] duration-300 ease-out',
        open ? 'max-w-72 pr-3' : 'max-w-14',
      )}
    >
      <LogoMark size={44} live={live} />
      <span
        className={cn(
          'flex min-w-0 items-center gap-2 pl-2.5 transition-opacity duration-200',
          open ? 'opacity-100 delay-100' : 'pointer-events-none opacity-0',
        )}
        aria-hidden={!open}
      >
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="font-display text-lg font-extrabold whitespace-nowrap">
            <span className="text-live">Up</span><span className="text-primary">Catch</span>
          </span>
          <span className="text-[11px] whitespace-nowrap text-muted-foreground">{state.live ? state.live.cityName : 'Soho, London'} · approx. area</span>
        </span>

      </span>
    </button>
  )
}
