'use client'

import { Bell, Check, Globe2, QrCode, ScanLine, Sparkles, UserPlus, X, Zap } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { friendQrValue, parseFriendQr, type QrFriend, type QrFriendState } from '@/lib/friend-qr'
import { haptic } from '@/lib/haptics'
import { cn } from '@/lib/utils'
import { useUpCatch } from './app-provider'
import { PersonAvatar, PrimaryButton } from './primitives'
import { useQrCamera } from './use-qr-camera'

function photo(id: string, token?: string) {
  return '/api/friend-photo?id=' + encodeURIComponent(id) + (token ? '&token=' + encodeURIComponent(token) : '')
}

export function LiveFriendsSheet() {
  const { state, actions } = useUpCatch()
  const [mode, setMode] = useState<'show' | 'scan'>(state.friendsSheet?.mode ?? 'show')
  const [stage, setStage] = useState<'scanning' | 'found' | 'waiting' | 'added'>('scanning')
  const [data, setData] = useState<QrFriendState | null>(null)
  const [target, setTarget] = useState<QrFriend | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<QrFriend | null>(null)
  const [removing, setRemoving] = useState(false)
  const [now, setNow] = useState(Date.now())
  const inFlight = useRef(false)
  const mounted = useRef(true)
  const actionsRef = useRef(actions)
  actionsRef.current = actions

  const command = useCallback(async (name: string, value?: string, quiet = false) => {
    if (inFlight.current) return null
    inFlight.current = true
    if (!quiet) { setPending(true); setError(null) }
    try {
      const { data: result, error: rpcError } = await createClient().rpc('friend_command', { p_command: name, p_value: value ?? null })
      if (!mounted.current) return null
      if (rpcError) { setError(rpcError.code === 'P0001' ? rpcError.message : 'Friends could not be loaded. Please retry.'); return null }
      const next = result as QrFriendState
      setData(next)
      setError(null)
      return next
    } catch {
      if (mounted.current) setError('Connection lost. Please retry.')
      return null
    } finally {
      inFlight.current = false
      if (mounted.current && !quiet) setPending(false)
    }
  }, [])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') void command(mode === 'show' ? 'code' : 'state', undefined, true) }
    refresh()
    const poll = setInterval(refresh, 2500)
    const clock = setInterval(() => setNow(Date.now()), 1000)
    return () => { clearInterval(poll); clearInterval(clock) }
  }, [mode, command])
  useEffect(() => {
    if (stage !== 'waiting' || !target || !data) return
    if (data.friends.some(friend => friend.id === target.id)) {
      haptic('success'); setStage('added'); void actionsRef.current.refreshFriends()
    } else if (!data.requests.some(request => !request.incoming && request.person_id === target.id)) {
      setStage('found'); setError('This request expired or was declined. Scan their current code to try again.')
    }
  }, [data, target, stage])
  const scan = useCallback(async (value: string) => {
    const decoded = parseFriendQr(value)
    if (!decoded) { setError('This is not an UpCatch friend code.'); return false }
    const result = await command('resolve', decoded)
    if (!result?.person || !mounted.current) return false
    setToken(decoded); setTarget(result.person); setStage('found'); haptic('incoming')
    return true
  }, [command])
  const switchMode = (next: 'show' | 'scan') => { haptic('select'); setMode(next); setStage('scanning'); setTarget(null); setToken(null); setError(null) }
  const add = async () => {
    if (!token || !target) return
    const result = await command('scan', token)
    if (!result) return
    if (result.friends.some(friend => friend.id === target.id)) { setStage('added'); await actionsRef.current.refreshFriends() }
    else setStage('waiting')
  }
  const confirm = async (requestId: string, person: QrFriend) => {
    const result = await command('confirm', requestId)
    if (!result) return
    setTarget(person); setMode('scan'); setStage('added'); haptic('success')
    await actionsRef.current.refreshFriends()
  }
  const removeFriend = async () => {
    if (!removeTarget || removing) return
    setRemoving(true)
    const { error: removeError } = await createClient().rpc('remove_friend', { p_user: removeTarget.id })
    if (removeError) setError('Unable to remove friend. Please try again.')
    else {
      setData(current => current ? { ...current, friends: current.friends.filter(friend => friend.id !== removeTarget.id) } : current)
      setRemoveTarget(null)
      await actionsRef.current.refreshFriends()
    }
    setRemoving(false)
  }
  const code = data?.code && Date.parse(data.code.expires_at) > now ? data.code.token : null
  const alreadyFriend = !!target && !!data?.friends.some(friend => friend.id === target.id)

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="friends-sheet-title" className="absolute inset-0 z-[65] flex flex-col bg-background animate-in fade-in slide-in-from-bottom-6 duration-300">
      <header className="flex items-center gap-3 px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-3">
        <button type="button" onClick={actions.closeFriends} aria-label="Close" className="press grid size-11 shrink-0 place-items-center rounded-full bg-muted"><X className="size-5" aria-hidden="true" /></button>
        <h2 id="friends-sheet-title" className="flex-1 font-display text-xl font-extrabold">Add a friend</h2>
      </header>
      <div role="tablist" aria-label="QR mode" className="mx-4 grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1">
        <Tab active={mode === 'show'} onClick={() => switchMode('show')} icon={<QrCode className="size-5" />}>My code</Tab>
        <Tab active={mode === 'scan'} onClick={() => switchMode('scan')} icon={<ScanLine className="size-5" />}>Scan</Tab>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-5 pb-[max(env(safe-area-inset-bottom),1.25rem)]">
        {mode === 'show' ? (
          <div className="flex flex-1 flex-col items-center gap-5 animate-in fade-in duration-300">
            <div className="relative flex w-full flex-col items-center gap-4 rounded-[2rem] bg-primary p-6 pt-12 text-primary-foreground shadow-xl shadow-primary/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={state.user.photo ?? '/placeholder-user.jpg'} alt="" className="absolute -top-8 size-16 rounded-full border-4 border-background object-cover" />
              <p className="font-display text-2xl font-extrabold">{state.user.name}</p>
              <div className="rounded-3xl bg-card p-4 text-foreground">
                {code ? <QRCodeSVG value={friendQrValue(code)} size={200} bgColor="transparent" fgColor="currentColor" level="M" aria-label={`QR code to add ${state.user.name} as a friend`} />
                  : <div className="grid size-[200px] place-items-center text-center" role="status">{error ? 'Code unavailable' : 'Refreshing your code…'}</div>}
              </div>
              <p className="flex items-center gap-1.5 text-sm font-semibold opacity-90"><Sparkles className="size-4" aria-hidden="true" /> Refreshes every 60s · no meetup required</p>
            </div>
            {data?.requests.filter(request => request.incoming).map(request => (
              <div key={request.id} className="flex w-full items-center gap-3 rounded-3xl bg-live p-3 text-live-foreground animate-in fade-in slide-in-from-bottom-4">
                <PersonAvatar photo={photo(request.person_id)} initials={request.name.slice(0, 2).toUpperCase()} size={48} />
                <p className="min-w-0 flex-1 font-display font-bold">{`${request.name} scanned your code`}</p>
                <button type="button" disabled={pending} onClick={() => void confirm(request.id, { id: request.person_id, name: request.name, photo_path: request.photo_path })} className="press min-h-11 rounded-xl bg-foreground px-4 font-display font-bold text-background">Confirm</button>
              </div>
            ))}
            {!data?.requests.some(request => request.incoming) && <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground" aria-live="polite"><span className="relative flex size-2.5"><span className="absolute inset-0 animate-ping rounded-full bg-live" /><span className="relative size-2.5 rounded-full bg-live" /></span>Hold your phone up so they can scan it</p>}
            <FriendPerks />
            {!!data?.friends.length && <section className="w-full rounded-3xl bg-card p-4" aria-label="Your friends"><h3 className="mb-3 font-display text-lg font-extrabold">Your friends</h3><ul className="flex flex-col gap-2">{data.friends.map(friend => <li key={friend.id} className="flex items-center gap-3 rounded-2xl bg-muted p-2"><PersonAvatar photo={photo(friend.id)} initials={friend.name.slice(0, 2).toUpperCase()} size={40} /><span className="min-w-0 flex-1 truncate font-semibold">{friend.name}</span><button type="button" onClick={() => setRemoveTarget(friend)} className="press min-h-11 rounded-xl px-3 text-sm font-bold text-destructive">Remove</button></li>)}</ul></section>}
          </div>
        ) : stage === 'scanning' ? <Scanner onCode={scan} /> : target && stage === 'found' ? (
          <div className="flex flex-1 flex-col gap-4 animate-in fade-in zoom-in-95 duration-300">
            <div className="flex flex-col items-center gap-3 rounded-[2rem] bg-card p-6 text-center">
              <PersonAvatar photo={photo(target.id, token ?? undefined)} initials={target.name.slice(0, 2).toUpperCase()} size={96} ring />
              <div><p className="font-display text-2xl font-extrabold">{target.name}</p><p className="text-sm text-muted-foreground">Add each other to stay connected.</p></div>
            </div>
            <FriendPerks />
            <div className="mt-auto flex flex-col gap-2">
              <PrimaryButton className="w-full" disabled={pending || alreadyFriend} onClick={() => void add()}><UserPlus className="size-5" aria-hidden="true" />{alreadyFriend ? 'Already friends' : pending ? 'Sending request…' : `Add ${target.name}`}</PrimaryButton>
              <button type="button" onClick={() => { setStage('scanning'); setTarget(null); setToken(null); setError(null) }} className="press min-h-12 rounded-2xl text-sm font-bold text-muted-foreground">Not now</button>
            </div>
          </div>
        ) : target && (
          <div className="flex flex-1 flex-col items-center gap-5 pt-6 text-center animate-in fade-in zoom-in-95 duration-300">
            <div className="relative">
              <PersonAvatar photo={photo(target.id)} initials={target.name.slice(0, 2).toUpperCase()} size={112} ring />
              <span className="uc-pop absolute -right-2 -top-2 grid size-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg">{stage === 'added' ? <Check className="size-6" aria-hidden="true" /> : <UserPlus className="size-6" aria-hidden="true" />}</span>
            </div>
            <div><p className="font-display text-3xl font-extrabold text-balance">{stage === 'added' ? `You & ${target.name} are friends` : 'Friend request sent'}</p><p className="mt-2 text-pretty leading-relaxed text-muted-foreground" role="status">{stage === 'added' ? 'You’re now connected. Manage friend alerts in your profile.' : `Ask ${target.name} to confirm on their My code screen.`}</p></div>
            <PrimaryButton className="mt-auto w-full" onClick={actions.closeFriends}>Done</PrimaryButton>
          </div>
        )}
        {error && <p className="mt-3 rounded-2xl bg-muted p-3 text-center text-sm text-muted-foreground" role="alert">{error}</p>}
      </div>
      {removeTarget && <div className="absolute inset-0 z-10 flex items-center justify-center bg-foreground/40 p-4"><section role="dialog" aria-modal="true" aria-label="Remove friend" className="w-full max-w-md rounded-3xl bg-card p-5"><h2 className="font-display text-2xl font-extrabold">Remove {removeTarget.name}?</h2><p className="mt-3 text-sm text-muted-foreground">You will no longer appear in each other&apos;s friends-only matching pool.</p><div className="mt-5 flex gap-3"><button type="button" disabled={removing} onClick={() => setRemoveTarget(null)} className="press min-h-12 flex-1 rounded-2xl bg-muted font-bold">Keep friend</button><button type="button" disabled={removing} onClick={() => void removeFriend()} className="press min-h-12 flex-1 rounded-2xl bg-destructive font-bold text-destructive-foreground">{removing ? 'Removing...' : 'Remove'}</button></div></section></div>}
    </div>
  )
}

function Tab({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return <button type="button" role="tab" aria-selected={active} onClick={onClick} className={cn('press flex min-h-12 items-center justify-center gap-2 rounded-xl font-display font-bold transition-colors', active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}><span aria-hidden="true">{icon}</span>{children}</button>
}

function Scanner({ onCode }: { onCode: (value: string) => Promise<boolean> }) {
  const { video, error, requested, retry } = useQrCamera(onCode)
  return <div className="flex flex-1 flex-col gap-4">
    <div className="relative aspect-square w-full overflow-hidden rounded-[2rem] bg-foreground">
      <video ref={video} autoPlay muted playsInline aria-label="Camera preview for scanning an UpCatch friend code" className="absolute inset-0 size-full object-cover" />
      <div className="absolute inset-[14%]">{['top-0 left-0 border-t-4 border-l-4 rounded-tl-3xl', 'top-0 right-0 border-t-4 border-r-4 rounded-tr-3xl', 'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-3xl', 'bottom-0 right-0 border-b-4 border-r-4 rounded-br-3xl'].map(c => <span key={c} className={cn('absolute size-12 border-live', c)} aria-hidden="true" />)}<span className="uc-scan-line" aria-hidden="true" /></div>
      <p className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-2 font-display font-bold text-live" aria-live="polite"><ScanLine className="size-5" aria-hidden="true" />{error ? 'Camera unavailable' : requested ? 'Looking for an UpCatch code…' : 'Allow your camera to scan'}</p>
    </div>
    <p className="text-center text-sm leading-relaxed text-muted-foreground text-pretty">Point at someone’s UpCatch code. You can add friends without a meetup.</p>
    {!requested && <PrimaryButton className="w-full" onClick={retry}><ScanLine className="size-5" aria-hidden="true" />Allow camera</PrimaryButton>}
    {error && <><p className="text-center text-sm text-muted-foreground" role="alert">{error}</p><PrimaryButton className="w-full" onClick={retry}>Retry camera</PrimaryButton></>}
  </div>
}

function FriendPerks() {
  const perks = [{ icon: <Globe2 className="size-5" />, text: 'Stay connected at any distance' }, { icon: <Bell className="size-5" />, text: 'Choose friend alerts in your profile' }, { icon: <Zap className="size-5" />, text: 'Match with friends when you’re both live' }]
  return <ul className="flex w-full flex-col gap-1 rounded-3xl bg-card p-2">{perks.map(perk => <li key={perk.text} className="flex min-h-12 items-center gap-3 px-2 text-sm font-semibold"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">{perk.icon}</span>{perk.text}</li>)}</ul>
}
