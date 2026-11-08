'use client'

import {
  BadgeCheck,
  Bell,
  ChevronRight,
  EyeOff,
  Globe2,
  Heart,
  MapPinOff,
  QrCode,
  RotateCcw,
  ScanLine,
  Share2,
  ShieldCheck,
  Trophy,
  Users,
  Send,
  UserX,
  Zap,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { version as appVersion } from '@/package.json'
import { InstallAppCard, NotificationHelp } from '@/components/account/install-app'
import { LearnMoreButton } from './how-it-works'
import { useState } from 'react'
import { useUpCatch, type FriendStatus } from './app-provider'
import { INTERESTS } from '@/lib/upcatch-data'
import { Chip, PersonAvatar, Switch } from './primitives'
import { type Badge, BADGES, BadgeMedal, ShareSheet } from './share-sheet'

export function ProfileScreen() {
  const { state, actions } = useUpCatch()
  const [demoSettings, setSettings] = useState({
    fuzz: true,
    verifiedOnly: true,
    share: true,
    hideAge: false,
    notifyFriends: true,
    friendMeetups: true,
    friendsFirst: true,
  })
  const settings=state.live ? {...demoSettings,verifiedOnly:false,share:false,notifyFriends:false,friendMeetups:false,friendsFirst:false,...state.memberSettings} : demoSettings
  const visibleBadges=state.live ? BADGES.map(b=>{
    const count=b.id==='friends'?state.friends.length:(state.badgeStats[b.id]??0)
    const need=b.id==='coffee'?5:b.id==='explorer'?7:b.id==='friends'?3:1
    return {...b,name:b.id==='explorer'?'City Explorer':b.name,progress:{have:Math.min(count,need),need}}
  }) : BADGES
  const [blocked,setBlocked]=useState<{id:string;name:string}[]|null>(null)
  const [guidelines,setGuidelines]=useState(false)
  const [removeTarget,setRemoveTarget]=useState<{id:string;name:string}|null>(null)
  const [shareBadge, setShareBadge] = useState<Badge | null>(null)
  const set = (k: keyof typeof settings) => (v: boolean) => state.live ? (k==='share'&&v&&!state.trustedEmail ? (()=>{const email=window.prompt('Trusted contact email');if(email)actions.setTrustedContact(email)})() : actions.saveSetting(k,v)) : setSettings((s) => ({ ...s, [k]: v }))

  return (
    <main className="absolute inset-0 z-20 overflow-y-auto bg-background pb-28 animate-in fade-in duration-200">
      <header className="flex flex-col items-center gap-3 px-5 pt-[max(env(safe-area-inset-top),1.5rem)] text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={state.user.photo ?? '/placeholder-user.jpg'}
          alt="Your profile"
          className="size-28 rounded-full border-4 border-card object-cover shadow-lg"
        />
        <div>
          <h1 className="font-display text-3xl font-extrabold">
            {state.user.name}, {state.live && !state.user.age ? '18+' : state.user.age}
          </h1>
          <div className="mt-2 flex flex-wrap justify-center gap-1.5">
            <Pill icon={<BadgeCheck className="size-3.5" />} label={state.live ? (state.live.idApproved ? 'ID' : 'Email') : 'ID'} />
            <Pill icon={<BadgeCheck className="size-3.5" />} label={state.live ? 'Photo uploaded' : 'Selfie'} />
            {!state.live && <Pill icon={<BadgeCheck className="size-3.5" />} label="Phone" />}
          </div>
        </div>
      </header>

      <section className="mx-4 mt-5 grid grid-cols-3 gap-2 text-center" aria-label="Your stats">
        <Stat value={String(state.live ? state.profileStats.completed_meetups : state.history.length + 5)} label="UpCatches" />
        <Stat value={state.live ? (state.profileStats.rating===null?'—':state.profileStats.rating.toFixed(1)) : '4.9'} label="Rating" />
        <Stat value={state.live ? (state.profileStats.show_up_percent===null?'—':state.profileStats.show_up_percent+'%') : '98%'} label="Show-up" />
      </section>

      <section className="mt-5 flex flex-col gap-3" aria-labelledby="badges-h">
        <div className="flex items-center justify-between px-5">
          <h2 id="badges-h" className="flex items-center gap-2 font-display text-lg font-extrabold">
            <Trophy className="size-5 text-primary" aria-hidden="true" /> Badges
            <span className="rounded-full bg-muted px-2 text-sm">
              {visibleBadges.filter((b) => !b.progress || b.progress.have >= b.progress.need).length}/{visibleBadges.length}
            </span>
          </h2>
          <span className="text-xs font-bold text-muted-foreground">Tap to share</span>
        </div>
        <ul className="flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {visibleBadges.map((b) => {
            const locked = !!b.progress && b.progress.have < b.progress.need
            return (
              <li key={b.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => (locked ? actions.showToast(`${b.name}: ${b.line}`) : setShareBadge(b))}
                  className="press flex w-28 flex-col items-center gap-2 rounded-3xl bg-card px-2 pt-4 pb-3 text-center"
                  aria-label={locked ? `${b.name}, locked` : `Share ${b.name} badge`}
                >
                  <BadgeMedal badge={b} size={60} />
                  <span className="line-clamp-2 min-h-8 text-xs leading-tight font-bold">{b.name}</span>
                  {locked && b.progress ? (
                    <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${(b.progress.have / b.progress.need) * 100}%` }} />
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] font-bold text-primary">
                      <Share2 className="size-3" aria-hidden="true" /> Share
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      {state.live && <section className="mx-4 mt-3 rounded-3xl bg-card p-2" aria-label="Notifications">
        <Row icon={<Bell className="size-5"/>} title="Push notifications" sub={state.pushBusy?'Connecting this device...':'Offers, meetup updates and friend alerts on this device'}>
          <Switch checked={state.pushEnabled} disabled={state.pushBusy} onChange={actions.setPushEnabled} label="Push notifications"/>
        </Row>
      </section>}
      {state.live && <section className="mx-4 mt-3 space-y-3 rounded-3xl bg-card p-4" aria-label="App help">
        <LearnMoreButton />
        <NotificationHelp />
        <InstallAppCard />
      </section>}
      <section className="mx-4 mt-3 flex flex-col gap-3 rounded-3xl bg-card p-4" aria-labelledby="friends-h">
        <div className="flex items-center justify-between">
          <h2 id="friends-h" className="flex items-center gap-2 font-display text-lg font-extrabold">
            <Users className="size-5 text-primary" aria-hidden="true" /> Friends
            <span className="rounded-full bg-muted px-2 text-sm">{state.friends.length}</span>
          </h2>
          <span className="flex items-center gap-1 text-xs font-bold text-muted-foreground">
            <Globe2 className="size-3.5" aria-hidden="true" /> Any distance
          </span>
        </div>
        <button type="button" onClick={() => actions.setTab('nudges')} className="press flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-bold text-primary-foreground"><Send className="size-4" aria-hidden="true" /> Nudge friends</button>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => actions.openFriends('show')}
            className="press flex min-h-16 items-center justify-center gap-2 rounded-2xl bg-primary font-display font-bold text-primary-foreground shadow-lg shadow-primary/30"
          >
            <QrCode className="size-5" aria-hidden="true" /> My code
          </button>
          <button
            type="button"
            onClick={() => actions.openFriends('scan')}
            className="press flex min-h-16 items-center justify-center gap-2 rounded-2xl bg-live font-display font-bold text-live-foreground"
          >
            <ScanLine className="size-5" aria-hidden="true" /> Scan
          </button>
        </div>
        {state.friends.length === 0 ? (
          <p className="rounded-2xl bg-muted p-4 text-center text-sm leading-relaxed text-muted-foreground">
            No friends yet. After a great UpCatch, swap QR codes to stay connected.
          </p>
        ) : (
          <ul className="flex flex-col">
            {state.friends.map((f) => (
              <li key={f.person.id} className="flex min-h-16 items-center gap-3 py-1.5">
                <PersonAvatar photo={f.person.photo} initials={f.person.initials} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{f.person.name}</p>
                  <p className="truncate text-sm text-muted-foreground">{f.where}</p>
                </div>
                <FriendStatusPill status={f.status} />
                <button type="button" onClick={()=>setRemoveTarget({id:f.person.id,name:f.person.name})} className="press min-h-10 rounded-xl px-2 text-xs font-bold text-destructive" aria-label={'Remove '+f.person.name+' from friends'}>Remove</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mx-4 mt-3 flex flex-col rounded-3xl bg-card p-2" aria-labelledby="friend-alerts-h">
        <h2 id="friend-alerts-h" className="flex items-center gap-2 px-2 pt-2 pb-1 font-display text-lg font-extrabold">
          <Bell className="size-5 text-primary" aria-hidden="true" /> Friend alerts
        </h2>
        <Row icon={<Zap className="size-5" />} title="Tell friends when I go free" sub="Push to friends, wherever they are">
          <Switch checked={settings.notifyFriends} onChange={set('notifyFriends')} label="Tell friends when I go free" />
        </Row>
        <Row icon={<Bell className="size-5" />} title="Friends’ new UpCatches" sub="Always shown, ignores distance radius">
          <Switch checked={settings.friendMeetups} onChange={set('friendMeetups')} label="Friends’ new UpCatches" />
        </Row>
        <Row icon={<Users className="size-5" />} title="Pair me with friends first" sub="When you’re both live">
          <Switch checked={settings.friendsFirst} onChange={set('friendsFirst')} label="Pair me with friends first" />
        </Row>
      </section>

      <section className="mx-4 mt-3 rounded-3xl bg-card p-4">
        <h2 className="font-display text-lg font-extrabold">Interests</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {(state.live ? INTERESTS : state.user.interests).map((i) => (
            <Chip key={i} highlight={!state.live || state.user.interests.includes(i)} onClick={state.live ? ()=>actions.saveInterests(state.user.interests.includes(i)?state.user.interests.filter(x=>x!==i):[...state.user.interests,i]) : undefined}>
              {i}
            </Chip>
          ))}
        </div>
      </section>

      <section className="mx-4 mt-3 flex flex-col rounded-3xl bg-card p-2" aria-labelledby="safety-h">
        <h2 id="safety-h" className="flex items-center gap-2 px-2 pt-2 pb-1 font-display text-lg font-extrabold">
          <ShieldCheck className="size-5 text-primary" aria-hidden="true" /> Safety & privacy
        </h2>
        <Row icon={<MapPinOff className="size-5" />} title="Approximate location only" sub="Always on · exact location stays private">
          <Switch checked disabled onChange={() => {}} label="Approximate location only" />
        </Row>
        <Row icon={<BadgeCheck className="size-5" />} title="Verified people only" sub={state.live ? 'Require approved ID for your matches' : 'Only ID-verified members can match'}>
          <Switch checked={settings.verifiedOnly} onChange={set('verifiedOnly')} label="Verified people only" />
        </Row>
        <Row icon={<Share2 className="size-5" />} title="Auto-share with trusted contact" sub={state.live ? (state.trustedEmail??'Add a trusted contact') : 'Jess · venue + who you meet'}>
          <Switch checked={settings.share} onChange={set('share')} label="Auto-share with trusted contact" />
        </Row>
        <Row icon={<EyeOff className="size-5" />} title="Hide my age" sub="Show an age range instead">
          <Switch checked={settings.hideAge} onChange={set('hideAge')} label="Hide my age" />
        </Row>
        <button type="button" className="text-left" onClick={()=>{if(!state.live){actions.showToast('Blocked people preview');return}void createClient().rpc('my_blocked_members').then(({data,error})=>{if(error)actions.showToast('Unable to load blocked people.');else setBlocked(data??[])})}}><Row icon={<UserX className="size-5" />} title="Blocked people" sub={state.live ? state.blockedCount+' blocked' : '2 blocked'}>
          <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" />
        </Row>
        </button>
        <button type="button" className="text-left" onClick={()=>setGuidelines(true)}><Row icon={<Heart className="size-5" />} title="Community guidelines" sub="Friendly, public, respectful">
          <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" />
        </Row></button>
      </section>

      <div className="mx-4 mt-4">
        <button
          type="button"
          onClick={actions.resetDemo}
          className="press flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-muted text-sm font-bold"
        >
          <RotateCcw className="size-4" aria-hidden="true" /> {state.live ? 'Sign out' : 'Restart demo from onboarding'}
        </button>
      </div>
      <p className="pb-4 pt-3 text-center text-xs text-muted-foreground">Version {appVersion.replace(/\.0$/, '')}</p>
      {removeTarget&&<div className="absolute inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4"><section role="dialog" aria-modal="true" aria-label="Remove friend" className="w-full max-w-md rounded-3xl bg-card p-5"><h2 className="font-display text-2xl font-extrabold">Remove {removeTarget.name}?</h2><p className="mt-3 text-sm text-muted-foreground">You will no longer appear in each other&apos;s friends-only matching pool.</p><div className="mt-5 flex gap-3"><button type="button" className="press min-h-12 flex-1 rounded-2xl bg-muted font-bold" onClick={()=>setRemoveTarget(null)}>Keep friend</button><button type="button" className="press min-h-12 flex-1 rounded-2xl bg-destructive font-bold text-destructive-foreground" onClick={()=>{actions.removeFriend(removeTarget.id);setRemoveTarget(null)}}>Remove</button></div></section></div>}
      {(blocked!==null||guidelines)&&<div className="absolute inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4"><section role="dialog" aria-modal="true" aria-label={guidelines?'Community guidelines':'Blocked people'} className="w-full max-w-md rounded-3xl bg-card p-5"><h2 className="font-display text-2xl font-extrabold">{guidelines?'Community guidelines':'Blocked people'}</h2>{guidelines?<p className="mt-4 text-sm leading-relaxed">Meet in public. Respect boundaries and consent. Be kind, arrive as agreed, and cancel if your plans change. Report harassment, unsafe behaviour, or misleading profiles through the safety centre.</p>:<ul className="mt-4 space-y-2">{blocked?.length===0&&<li className="text-sm text-muted-foreground">No blocked people.</li>}{blocked?.map(person=><li key={person.id} className="flex items-center justify-between rounded-2xl bg-muted p-3"><span>{person.name}</span><button type="button" className="press rounded-full bg-primary px-3 py-2 text-sm font-bold text-primary-foreground" onClick={()=>{void createClient().rpc('unblock_member',{p_user:person.id}).then(({error})=>{if(error){actions.showToast('Unblock failed.');return}setBlocked(people=>people?.filter(p=>p.id!==person.id)??[]);actions.showToast('Member unblocked.')})}}>Unblock</button></li>)}</ul>}<button type="button" className="press mt-4 min-h-12 w-full rounded-2xl bg-muted font-bold" onClick={()=>{setBlocked(null);setGuidelines(false)}}>Close</button></section></div>}
      {shareBadge && <ShareSheet target={{ kind: 'badge', badge: shareBadge }} onClose={() => setShareBadge(null)} />}
    </main>
  )
}

function FriendStatusPill({ status }: { status: FriendStatus }) {
  const map = {
    free: { label: 'Free now', cls: 'bg-live text-live-foreground' },
    hosting: { label: 'Hosting', cls: 'bg-primary/10 text-primary' },
    offline: { label: 'Offline', cls: 'bg-muted text-muted-foreground' },
  }[status]
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${map.cls}`}>{map.label}</span>
}

function Pill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
      <span aria-hidden="true">{icon}</span>
      {label}{label==='Photo uploaded' ? '' : ' verified'}
    </span>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-3xl bg-card py-3">
      <p className="font-display text-2xl font-extrabold">{value}</p>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
    </div>
  )
}

function Row({ icon, title, sub, children }: { icon: React.ReactNode; title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-16 items-center gap-3 rounded-2xl px-2 py-2">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{sub}</p>
      </div>
      {children}
    </div>
  )
}
