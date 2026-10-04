'use client'

import {
  Camera,
  Coffee,
  Compass,
  Download,
  EyeOff,
  Footprints,
  Handshake,
  Link2,
  type LucideIcon,
  MessageCircle,
  Moon,
  Share2,
  Sparkles,
  Sunrise,
  X,
  Zap,
} from 'lucide-react'
import { useState } from 'react'
import { haptic } from '@/lib/haptics'
import type { Person } from '@/lib/upcatch-data'
import { cn } from '@/lib/utils'
import { useUpCatch } from './app-provider'
import { LogoMark } from './brand-badge'
import { Switch } from './primitives'

export type Badge = {
  id: string
  name: string
  line: string
  icon: LucideIcon
  tone: 'primary' | 'live' | 'ink'
  progress?: { have: number; need: number }
}

export const BADGES: Badge[] = [
  { id: 'first', name: 'First Catch', line: 'Met a stranger. Survived. Loved it.', icon: Sparkles, tone: 'live' },
  { id: 'fast', name: '18-Second Match', line: 'Opened the app → plans confirmed.', icon: Zap, tone: 'primary' },
  { id: 'coffee', name: 'Flat White Diplomat', line: '5 coffees with 5 new people.', icon: Coffee, tone: 'ink' },
  { id: 'friends', name: 'Strangers → Friends', line: 'Swapped codes after 3 UpCatches.', icon: Handshake, tone: 'live' },
  { id: 'explorer', name: 'Soho Explorer', line: '7 new venues and counting.', icon: Compass, tone: 'primary', progress: { have: 5, need: 7 } },
  { id: 'owl', name: 'Night Owl', line: 'An UpCatch after 9pm.', icon: Moon, tone: 'ink', progress: { have: 0, need: 1 } },
  { id: 'early', name: 'Sunrise Crew', line: 'An UpCatch before 8am.', icon: Sunrise, tone: 'live', progress: { have: 0, need: 1 } },
]

const TONES = {
  primary: 'bg-primary text-primary-foreground',
  live: 'bg-live text-live-foreground',
  ink: 'bg-foreground text-background',
}

export function BadgeMedal({ badge, size = 64 }: { badge: Badge; size?: number }) {
  const Icon = badge.icon
  const locked = !!badge.progress && badge.progress.have < badge.progress.need
  return (
    <span
      className={cn(
        'relative grid shrink-0 place-items-center rounded-full ring-4 ring-card',
        locked ? 'bg-muted text-muted-foreground' : TONES[badge.tone],
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span className="absolute inset-1.5 rounded-full border-2 border-dashed border-current opacity-30" />
      <Icon style={{ width: size * 0.42, height: size * 0.42 }} />
    </span>
  )
}

export type ShareTarget =
  | { kind: 'meetup'; person: Person; intentLabel: string; venueName: string; durationMin: number }
  | { kind: 'badge'; badge: Badge }

const CARD_STYLES = ['Story', 'Ticket'] as const

export function ShareSheet({ target, onClose }: { target: ShareTarget; onClose: () => void }) {
  const { state, actions } = useUpCatch()
  const [style, setStyle] = useState<(typeof CARD_STYLES)[number]>('Story')
  const [hideFace, setHideFace] = useState(true)
  const code = `${state.user.name.toUpperCase()}-7K`
  const link = state.live ? (typeof window!=='undefined'?window.location.host:'') : `upcatch.app/i/${code.toLowerCase()}`

  const shareText =
    target.kind === 'meetup'
      ? state.live ? `I met someone for ${target.intentLabel.toLowerCase()} at ${target.venueName} with UpCatch. Join us: ${link}` : `I just UpCaught a stranger for ${target.intentLabel.toLowerCase()} in Soho. Matched in 18 seconds. Your turn: ${link}`
      : `Unlocked "${target.badge.name}" on UpCatch. ${target.badge.line} Try it: ${link}`

  async function send(channel: string) {
    haptic('tap')
    const url=state.live?window.location.origin:'https://'+link
    try{
      if(channel==='save'){
        await document.fonts.ready
        const canvas=document.createElement('canvas');canvas.width=720;canvas.height=1280
        const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Export unavailable')
        const palette=getComputedStyle(document.documentElement)
        ctx.fillStyle=palette.getPropertyValue('--primary').trim()||'#2563eb';ctx.fillRect(0,0,720,1280)
        ctx.fillStyle=palette.getPropertyValue('--live').trim()||'#facc15';ctx.fillRect(44,44,632,90)
        ctx.fillStyle='#102030';ctx.font='bold 42px '+getComputedStyle(document.querySelector('h1')??document.body).fontFamily;ctx.fillText('UpCatch',72,106)
        ctx.fillStyle='#ffffff';ctx.font='bold 52px '+getComputedStyle(document.querySelector('h1')??document.body).fontFamily
        const title=target.kind==='badge'?target.badge.name:target.intentLabel+' at '+target.venueName
        let line='',y=360;for(const word of title.split(' ')){const next=line?line+' '+word:word;if(ctx.measureText(next).width>600&&line){ctx.fillText(line,60,y);y+=70;line=word}else line=next}ctx.fillText(line,60,y)
        ctx.font='32px sans-serif';ctx.fillText(target.kind==='badge'?'Badge unlocked':'A real meetup. A new connection.',60,y+120)
        ctx.font='26px sans-serif';ctx.fillText(url,60,1170)
        const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Export failed')),'image/png'))
        const objectUrl=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=objectUrl;anchor.download='upcatch-card.png';anchor.click();setTimeout(()=>URL.revokeObjectURL(objectUrl),1000)
        actions.showToast('Card downloaded.');return
      }
      if(channel!=='copy'&&navigator.share){await navigator.share({title:'UpCatch',text:shareText,url});return}
      if(!navigator.clipboard)throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(shareText);actions.showToast('Link copied.')
    }catch(error){if(error instanceof Error&&error.name==='AbortError')return;actions.showToast('Sharing failed. Please try again.')}
  }

  return (
    <div
      className="absolute inset-0 z-[65] flex flex-col bg-foreground/80 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="Share"
    >
      <header className="flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),1rem)]">
        <div className="flex gap-1 rounded-full bg-background/15 p-1" role="radiogroup" aria-label="Card style">
          {CARD_STYLES.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={style === s}
              onClick={() => {
                haptic('select')
                setStyle(s)
              }}
              className={cn(
                'press min-h-11 rounded-full px-4 text-sm font-bold transition-colors',
                style === s ? 'bg-background text-foreground' : 'text-background',
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close share"
          className="press grid size-12 place-items-center rounded-full bg-background/15 text-background"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center px-8 py-4">
        {target.kind === 'meetup' ? (
          <MeetupCard target={target} style={style} hideFace={hideFace} code={code} />
        ) : (
          <BadgeCard badge={target.badge} style={style} code={code} />
        )}
      </div>

      <section className="flex flex-col gap-4 rounded-t-[2rem] bg-card px-5 pt-5 pb-safe animate-in slide-in-from-bottom-8 duration-300">
        {target.kind === 'meetup' && (
          <div className="flex items-center gap-3">
            <EyeOff className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Blur {target.person.name}&apos;s face</p>
              <p className="text-sm text-muted-foreground">Unblurs only if {target.person.name} approves</p>
            </div>
            <Switch checked={hideFace} onChange={value=>{if(state.live&&!value){actions.showToast('Keep their photo private unless they have agreed to share it.');return}setHideFace(value)}} label={`Blur ${target.person.name}'s face`} />
          </div>
        )}
        <div className="grid grid-cols-5 gap-2 pb-3">
          <ShareAction icon={Camera} label="Story" onClick={() => send('story')} highlight />
          <ShareAction icon={MessageCircle} label="Chat" onClick={() => send('chat')} />
          <ShareAction icon={Link2} label="Copy" onClick={() => send('copy')} />
          <ShareAction icon={Download} label="Save" onClick={() => send('save')} />
          <ShareAction icon={Share2} label="More" onClick={() => send('more')} />
        </div>
      </section>
    </div>
  )
}

function ShareAction({
  icon: Icon,
  label,
  onClick,
  highlight,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  highlight?: boolean
}) {
  return (
    <button type="button" onClick={onClick} className="press flex min-h-16 flex-col items-center gap-1.5">
      <span
        className={cn(
          'grid size-13 place-items-center rounded-2xl',
          highlight ? 'bg-live text-live-foreground' : 'bg-muted text-foreground',
        )}
        aria-hidden="true"
      >
        <Icon className="size-5" />
      </span>
      <span className="text-xs font-semibold">{label}</span>
    </button>
  )
}

function CardFooter({ code, dark }: { code: string; dark?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5 rounded-2xl p-2.5', dark ? 'bg-background/10' : 'bg-foreground/10')}>
      <LogoMark size={32} />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="text-[11px] font-semibold opacity-75">Someone near you is free right now</p>
        <p className="font-display text-sm font-extrabold">Tap to find out who · {code}</p>
      </div>
    </div>
  )
}

function MeetupCard({
  target,
  style,
  hideFace,
  code,
}: {
  target: Extract<ShareTarget, { kind: 'meetup' }>
  style: string
  hideFace: boolean
  code: string
}) {
  const { state } = useUpCatch()
  const faces = (
    <div className="flex items-center justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={state.user.photo ?? '/placeholder-user.jpg'} alt="" className="size-20 -rotate-6 rounded-full border-4 border-live object-cover" />
      <span className="relative -ml-5 size-20 rotate-6 overflow-hidden rounded-full border-4 border-live">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={target.person.photo || '/placeholder.svg'}
          alt=""
          className={cn('size-full object-cover transition-[filter] duration-300', hideFace && 'scale-125 blur-md')}
        />
        {hideFace && (
          <span className="absolute inset-0 grid place-items-center font-display text-xl font-extrabold text-primary-foreground">
            {target.person.initials}
          </span>
        )}
      </span>
    </div>
  )

  if (style === 'Ticket') {
    return (
      <article className="uc-pop flex w-full max-w-72 flex-col overflow-hidden rounded-3xl bg-card text-card-foreground shadow-2xl">
        <div className="flex flex-col gap-4 bg-primary p-5 text-primary-foreground">
          <div className="flex items-center justify-between text-xs font-bold tracking-widest uppercase opacity-80">
            <span>Admit two strangers</span>
            <span>No. 007</span>
          </div>
          {faces}
          <p className="text-center font-display text-2xl leading-tight font-extrabold text-balance">
            {target.intentLabel} at {target.venueName}
          </p>
        </div>
        <div className="relative border-t-2 border-dashed border-muted">
          <span className="absolute -top-3 -left-3 size-6 rounded-full bg-foreground/80" aria-hidden="true" />
          <span className="absolute -top-3 -right-3 size-6 rounded-full bg-foreground/80" aria-hidden="true" />
        </div>
        <dl className="grid grid-cols-3 gap-2 px-5 py-4 text-center">
          <TicketStat label="Matched" value={state.live ? 'Mutual' : '18s'} />
          <TicketStat label="Walked" value={state.live ? '—' : `${target.person.walkMin} min`} />
          <TicketStat label="Stayed" value={`${target.durationMin}m`} />
        </dl>
        <div className="px-3 pb-3">
          <CardFooter code={code} />
        </div>
      </article>
    )
  }

  return (
    <article className="uc-pop flex aspect-[9/16] max-h-full w-full max-w-64 flex-col justify-between gap-3 overflow-hidden rounded-[2rem] bg-primary p-5 text-primary-foreground shadow-2xl">
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-live px-3 py-1 font-display text-xs font-extrabold text-live-foreground">UpCaught</span>
        <span className="text-xs font-semibold opacity-75">{state.live ? 'Today' : 'Soho · Today'}</span>
      </div>
      <div className="flex flex-col gap-4">
        {faces}
        <p className="text-center font-display text-3xl leading-[1.05] font-extrabold text-balance">
          Two strangers. One {target.intentLabel.toLowerCase()}. {target.durationMin} minutes.
        </p>
        <div className="flex flex-wrap justify-center gap-1.5 text-xs font-bold">
          <span className="rounded-full bg-primary-foreground/15 px-2.5 py-1">{state.live ? 'Both accepted' : 'Matched in 18s'}</span>
          <span className="rounded-full bg-primary-foreground/15 px-2.5 py-1">{target.venueName}</span>
        </div>
      </div>
      <CardFooter code={code} dark />
    </article>
  )
}

function TicketStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold text-muted-foreground uppercase">{label}</dt>
      <dd className="font-display text-lg font-extrabold">{value}</dd>
    </div>
  )
}

function BadgeCard({ badge, style, code }: { badge: Badge; style: string; code: string }) {
  const { state } = useUpCatch()
  const ticket = style === 'Ticket'
  return (
    <article
      className={cn(
        'uc-pop flex w-full max-w-64 flex-col items-center justify-between gap-4 overflow-hidden rounded-[2rem] p-5 text-center shadow-2xl',
        ticket ? 'bg-card text-card-foreground' : 'aspect-[9/16] max-h-full bg-primary text-primary-foreground',
      )}
    >
      <p className="text-xs font-bold tracking-widest uppercase opacity-75">Badge unlocked</p>
      <div className="relative grid place-items-center">
        <span className="uc-ping is-live" aria-hidden="true" />
        <BadgeMedal badge={badge} size={112} />
      </div>
      <div>
        <p className="font-display text-3xl leading-tight font-extrabold text-balance">{badge.name}</p>
        <p className="mt-2 text-sm leading-relaxed opacity-80">{badge.line}</p>
        <p className="mt-3 text-xs font-bold opacity-70">
          {state.user.name} · 1 of 212 in London
        </p>
      </div>
      <div className="w-full">
        <CardFooter code={code} dark={!ticket} />
      </div>
    </article>
  )
}
