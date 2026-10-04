'use client'

import { Bell, Check, Globe2, QrCode, ScanLine, Sparkles, UserPlus, X, Zap } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useState } from 'react'
import { haptic } from '@/lib/haptics'
import { sharedInterests } from '@/lib/upcatch-data'
import { cn } from '@/lib/utils'
import { useUpCatch } from './app-provider'
import { Chip, PersonAvatar, PrimaryButton, Verified } from './primitives'

type ScanStage = 'scanning' | 'found' | 'added'

export function FriendsSheet() {
  const { state, actions } = useUpCatch()
  const sheet = state.friendsSheet
  const [mode, setMode] = useState<'show' | 'scan'>(sheet?.mode ?? 'show')
  const [stage, setStage] = useState<ScanStage>('scanning')
  const [peerScanned, setPeerScanned] = useState(false)

  const target = sheet?.target
  const alreadyFriend = target ? state.friends.some((f) => f.person.id === target.id) : false

  useEffect(() => {
    if (mode !== 'scan' || stage !== 'scanning') return
    const t = window.setTimeout(() => {
      haptic('incoming')
      setStage('found')
    }, 2200)
    return () => window.clearTimeout(t)
  }, [mode, stage])

  useEffect(() => {
    if (mode !== 'show' || peerScanned) return
    const t = window.setTimeout(() => {
      haptic('success')
      setPeerScanned(true)
    }, 4500)
    return () => window.clearTimeout(t)
  }, [mode, peerScanned])

  if (!sheet || !target) return null

  const switchMode = (m: 'show' | 'scan') => {
    haptic('select')
    setMode(m)
    setStage('scanning')
  }

  const shared = sharedInterests(state.user.interests, target.interests)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="friends-sheet-title"
      className="absolute inset-0 z-[65] flex flex-col bg-background animate-in fade-in slide-in-from-bottom-6 duration-300"
    >
      <header className="flex items-center gap-3 px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-3">
        <button
          type="button"
          onClick={actions.closeFriends}
          aria-label="Close"
          className="press grid size-11 shrink-0 place-items-center rounded-full bg-muted"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
        <h2 id="friends-sheet-title" className="flex-1 font-display text-xl font-extrabold">
          Add a friend
        </h2>
      </header>

      <div role="tablist" aria-label="QR mode" className="mx-4 grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1">
        <TabButton active={mode === 'show'} onClick={() => switchMode('show')} icon={<QrCode className="size-5" />}>
          My code
        </TabButton>
        <TabButton active={mode === 'scan'} onClick={() => switchMode('scan')} icon={<ScanLine className="size-5" />}>
          Scan
        </TabButton>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-5 pb-[max(env(safe-area-inset-bottom),1.25rem)]">
        {mode === 'show' ? (
          <ShowCode
            name={state.user.name}
            photo={state.user.photo}
            peerScanned={peerScanned}
            target={target}
            onDone={() => {
              actions.addFriend(target)
              actions.closeFriends()
              actions.showToast(`You and ${target.name} are now friends`)
            }}
          />
        ) : stage === 'scanning' ? (
          <Scanner />
        ) : stage === 'found' ? (
          <div className="flex flex-1 flex-col gap-4 animate-in fade-in zoom-in-95 duration-300">
            <div className="flex flex-col items-center gap-3 rounded-[2rem] bg-card p-6 text-center">
              <PersonAvatar photo={target.photo} initials={target.initials} size={96} ring />
              <div>
                <p className="font-display text-2xl font-extrabold">
                  {target.name}, {target.age}
                </p>
                <p className="text-sm text-muted-foreground">{target.bio}</p>
              </div>
              <div className="flex flex-wrap justify-center gap-1.5">
                <Verified label="ID verified" />
                <Verified label={`${target.rating} rating`} />
              </div>
              {shared.length > 0 && (
                <div className="flex flex-wrap justify-center gap-1.5">
                  {shared.map((i) => (
                    <Chip key={i} highlight>
                      {i}
                    </Chip>
                  ))}
                </div>
              )}
            </div>
            <FriendPerks />
            <div className="mt-auto flex flex-col gap-2">
              <PrimaryButton
                className="w-full"
                disabled={alreadyFriend}
                onClick={() => {
                  actions.addFriend(target)
                  setStage('added')
                }}
              >
                <UserPlus className="size-5" aria-hidden="true" />
                {alreadyFriend ? 'Already friends' : `Add ${target.name}`}
              </PrimaryButton>
              <button
                type="button"
                onClick={() => setStage('scanning')}
                className="press min-h-12 rounded-2xl text-sm font-bold text-muted-foreground"
              >
                Not now
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center gap-5 pt-6 text-center animate-in fade-in zoom-in-95 duration-300">
            <div className="relative">
              <PersonAvatar photo={target.photo} initials={target.initials} size={112} ring />
              <span className="uc-pop absolute -right-2 -top-2 grid size-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg">
                <Check className="size-6" aria-hidden="true" />
              </span>
            </div>
            <div>
              <p className="font-display text-3xl font-extrabold text-balance">{`You & ${target.name} are friends`}</p>
              <p className="mt-2 text-pretty leading-relaxed text-muted-foreground">
                {`You'll each get a ping when the other goes free or posts an UpCatch, wherever you are.`}
              </p>
            </div>
            <PrimaryButton className="mt-auto w-full" onClick={actions.closeFriends}>
              Done
            </PrimaryButton>
          </div>
        )}
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'press flex min-h-12 items-center justify-center gap-2 rounded-xl font-display font-bold transition-colors',
        active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
      )}
    >
      <span aria-hidden="true">{icon}</span>
      {children}
    </button>
  )
}

function ShowCode({
  name,
  photo,
  peerScanned,
  target,
  onDone,
}: {
  name: string
  photo: string | null
  peerScanned: boolean
  target: { name: string; photo: string; initials: string }
  onDone: () => void
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-5 animate-in fade-in duration-300">
      <div className="relative flex w-full flex-col items-center gap-4 rounded-[2rem] bg-primary p-6 pt-12 text-primary-foreground shadow-xl shadow-primary/30">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo ?? '/people/alex.png'}
          alt=""
          className="absolute -top-8 size-16 rounded-full border-4 border-background object-cover"
        />
        <p className="font-display text-2xl font-extrabold">{name}</p>
        <div className="rounded-3xl bg-card p-4 text-foreground">
          <QRCodeSVG
            value={`https://upcatch.app/f/${name.toLowerCase()}-7k2q`}
            size={200}
            bgColor="transparent"
            fgColor="currentColor"
            level="M"
            aria-label={`QR code to add ${name} as a friend`}
          />
        </div>
        <p className="flex items-center gap-1.5 text-sm font-semibold opacity-90">
          <Sparkles className="size-4" aria-hidden="true" /> Refreshes every 60s · only works in person
        </p>
      </div>

      {peerScanned ? (
        <div className="flex w-full items-center gap-3 rounded-3xl bg-live p-3 text-live-foreground animate-in fade-in slide-in-from-bottom-4">
          <PersonAvatar photo={target.photo} initials={target.initials} size={48} />
          <p className="min-w-0 flex-1 font-display font-bold">{`${target.name} scanned your code`}</p>
          <button
            type="button"
            onClick={onDone}
            className="press min-h-11 rounded-xl bg-foreground px-4 font-display font-bold text-background"
          >
            Confirm
          </button>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground" aria-live="polite">
          <span className="relative flex size-2.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-live" />
            <span className="relative size-2.5 rounded-full bg-live" />
          </span>
          Hold your phone up so they can scan it
        </p>
      )}

      <FriendPerks />
    </div>
  )
}

function Scanner() {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="relative aspect-square w-full overflow-hidden rounded-[2rem] bg-foreground">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/venues/cafe.jpg" alt="" className="absolute inset-0 size-full scale-110 object-cover opacity-50 blur-sm" />
        <div className="absolute inset-[14%]">
          {['top-0 left-0 border-t-4 border-l-4 rounded-tl-3xl', 'top-0 right-0 border-t-4 border-r-4 rounded-tr-3xl', 'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-3xl', 'bottom-0 right-0 border-b-4 border-r-4 rounded-br-3xl'].map((c) => (
            <span key={c} className={cn('absolute size-12 border-live', c)} aria-hidden="true" />
          ))}
          <span className="uc-scan-line" aria-hidden="true" />
        </div>
        <p
          className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-2 font-display font-bold text-live"
          aria-live="polite"
        >
          <ScanLine className="size-5" aria-hidden="true" /> Looking for an UpCatch code…
        </p>
      </div>
      <p className="text-center text-sm leading-relaxed text-muted-foreground text-pretty">
        Point at your meetup partner&apos;s code. Friends can only be added face to face.
      </p>
    </div>
  )
}

function FriendPerks() {
  const perks = [
    { icon: <Globe2 className="size-5" />, text: 'See each other’s UpCatches at any distance' },
    { icon: <Bell className="size-5" />, text: 'Get a ping when they go free' },
    { icon: <Zap className="size-5" />, text: 'Matched first when you’re both live' },
  ]
  return (
    <ul className="flex w-full flex-col gap-1 rounded-3xl bg-card p-2">
      {perks.map((p) => (
        <li key={p.text} className="flex min-h-12 items-center gap-3 px-2 text-sm font-semibold">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
            {p.icon}
          </span>
          {p.text}
        </li>
      ))}
    </ul>
  )
}
