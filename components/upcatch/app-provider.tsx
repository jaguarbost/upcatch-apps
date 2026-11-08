'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { LiveBootstrap, LiveState, ProfileStats } from '@/lib/live-model'
import { setPushEnabled as changePushEnabled, restorePush, detachPush } from '@/lib/push-client'
import { LocationError, saveBrowserLocation } from '@/lib/browser-location'
import { observeLocationPermission } from '@/lib/browser-permissions'
import { haptic } from '@/lib/haptics'
import {
  INCOMING_OFFERS,
  clockIn,
  personById,
  venueById as venueFallback,
  type IntentId,
  type Offer,
  type Person,
} from '@/lib/upcatch-data'

export type Phase = 'idle' | 'free' | 'hosting' | 'live' | 'arrived' | 'rating'
export type Tab = 'map' | 'wall' | 'messages' | 'activity' | 'meetups' | 'profile' | 'nudges'

export interface UserProfile {
  name: string
  age: number
  photo: string | null
  interests: string[]
}

export interface Draft {
  intent: IntentId | null
  note: string
  durationMin: number
  windowMin: number
  radiusKm: number
  prefs: string[]
  venueId: string | null
  scheduledAt: string
}

export interface Meetup {
  person: Person
  venueId: string
  intent: IntentId
  durationMin: number
  startLabel: string
  endLabel: string
}

export interface ScheduledPlan {
  post_id: string
  starts_at: string
  ends_at: string
  intent: IntentId
  note: string
  partner_name: string
  is_mine: boolean
}

export interface JoinRequest {
  id: string
  person: Person
}

export interface HistoryItem {
  creationType?:'manual'|'auto'
  id: string
  person: Person
  intent: IntentId
  venueId: string
  rating: number
  when: string
}

export interface Message {
  id: number
  from: 'me' | 'them'
  text: string
}

const DEFAULT_DRAFT: Draft = {
  intent: null,
  note: '',
  durationMin: 30,
  windowMin: 60,
  radiusKm: 4.828032,
  prefs: [],
  venueId: null,
  scheduledAt: '',
}

const SEEDED_HISTORY: HistoryItem[] = [
  { id: 'h1', person: personById('sam'), intent: 'coffee', venueId: 'kin', rating: 5, when: 'Yesterday' },
  { id: 'h2', person: personById('priya'), intent: 'walk', venueId: 'golden', rating: 5, when: 'Mon' },
]

const HOST_REQUEST_QUEUE: { personId: string; delay: number }[] = [
  { personId: 'priya', delay: 2800 },
  { personId: 'sam', delay: 6500 },
  { personId: 'maya', delay: 11000 },
]

export type FriendStatus = 'free' | 'hosting' | 'offline'

export interface Friend {
  person: Person
  status: FriendStatus
  where: string
  since: string
}

export interface FriendsSheetState {
  mode: 'show' | 'scan'
  target: Person
}

const SEEDED_FRIENDS: Friend[] = [
  { person: personById('priya'), status: 'free', where: '4.2 km · Shoreditch', since: 'Friends since Mon' },
  { person: personById('jordan'), status: 'hosting', where: '7.8 km · Camden', since: 'Friends since Aug' },
]

const AUTO_REPLIES = ['Perfect, see you soon!', 'Nice — nearly there.', 'Sounds good!']

function useUpCatchState(initial?: LiveBootstrap) {
  const [onboarded, setOnboarded] = useState(initial?.completed ?? false)
  const [user, setUser] = useState<UserProfile>(initial ? { name: initial.name, age: 0, photo: initial.photo, interests: [] } : { name: 'Alex', age: 29, photo: '/people/alex.png', interests: ['Coffee', 'Design', 'Startups', 'Running'] })
  const [tab, setTab] = useState<Tab>('map')
  const [phase, setPhase] = useState<Phase>('idle')
  const [freeForMin, setFreeForMin] = useState(60)
  const [createStep, setCreateStep] = useState(0)
  const [createMode, setCreateMode] = useState<'instant' | 'scheduled'>('instant')
  const [createModeLocked, setCreateModeLocked] = useState(false)
  const [scheduledBusy, setScheduledBusy] = useState(false)
  const [scheduledPostNotice, setScheduledPostNotice] = useState<string | null>(null)
  const [scheduledPlan, setScheduledPlan] = useState<ScheduledPlan | null>(null)
  const [scheduledPlans, setScheduledPlans] = useState<ScheduledPlan[]>([])
  const [scheduledPlanFlash, setScheduledPlanFlash] = useState<ScheduledPlan | null>(null)
  const [scheduledMessages, setScheduledMessages] = useState<Message[]>([])
  const [scheduledMessageMap, setScheduledMessageMap] = useState<Record<string,Message[]>>({})
  const [messageTarget, setMessageTarget] = useState<'live' | 'scheduled' | null>(null)
  const [selectedScheduledPostId, setSelectedScheduledPostId] = useState<string | null>(null)
  useEffect(()=>{
    if(window.location.pathname!=='/app')return
    const params=new URLSearchParams(window.location.search)
    const view=params.get('view')
    if(view==='messages'){
      setTab('messages')
      const chat=params.get('chat')
      setMessageTarget(chat==='live'?'live':chat==='scheduled'?'scheduled':null)
      setSelectedScheduledPostId(chat==='scheduled'?params.get('post'):null)
    }else if(view==='meetups'||view==='wall'||view==='nudges')setTab(view)
  },[])
  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT)
  const [hosting, setHosting] = useState<Draft | null>(null)
  const [incoming, setIncoming] = useState<Offer | null>(null)
  const [offerIndex, setOfferIndex] = useState(0)
  const [requests, setRequests] = useState<JoinRequest[]>([])
  const [meetup, setMeetup] = useState<Meetup | null>(null)
  const [progress, setProgress] = useState({ me: 0, them: 0 })
  const [matchFlash, setMatchFlash] = useState<Person | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>(initial ? [] : SEEDED_HISTORY)
  const [messages, setMessages] = useState<Message[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [friends, setFriends] = useState<Friend[]>(initial ? [] : SEEDED_FRIENDS)
  const [friendsSheet, setFriendsSheet] = useState<FriendsSheetState | null>(null)
  const [friendAlert, setFriendAlert] = useState<Friend | null>(null)
  const friendAlertShown = useRef(false)
  const msgId = useRef(0)
  const [brandOpen, setBrandOpen] = useState(true)

  // Brand badge introduces itself once, then tucks away to free up the map
  useEffect(() => {
    if (!onboarded) return
    const t = window.setTimeout(() => setBrandOpen(false), 3500)
    return () => window.clearTimeout(t)
  }, [onboarded])

  // Simulated friend push: friends are notified regardless of distance
  useEffect(() => {
    if (initial || !onboarded || phase !== 'idle' || tab !== 'map' || friendAlertShown.current) return
    const t = window.setTimeout(() => {
      friendAlertShown.current = true
      setFriendAlert(SEEDED_FRIENDS[0])
      haptic('incoming')
    }, 5000)
    return () => window.clearTimeout(t)
  }, [onboarded, phase, tab])

  const showToast = useCallback((text: string) => {
    setToast(text)
    window.setTimeout(() => setToast((t) => (t === text ? null : t)), 2600)
  }, [])

  // Simulated incoming UpCatch while the user is "free now"
  useEffect(() => {
    if (initial || phase !== 'free' || incoming) return
    const t = window.setTimeout(
      () => {
        setIncoming(INCOMING_OFFERS[offerIndex % INCOMING_OFFERS.length])
        haptic('incoming')
      },
      offerIndex === 0 ? 2600 : 4200,
    )
    return () => window.clearTimeout(t)
  }, [phase, incoming, offerIndex])

  // Simulated join requests arriving while hosting
  useEffect(() => {
    if (initial || phase !== 'hosting') return
    const timers = HOST_REQUEST_QUEUE.map(({ personId, delay }) =>
      window.setTimeout(() => {
        setRequests((r) => (r.some((x) => x.id === personId) ? r : [{ id: personId, person: personById(personId) }, ...r]))
        haptic('incoming')
      }, delay),
    )
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [phase])

  // Simulated approximate journey progress
  useEffect(() => {
    if (initial || (phase !== 'live' && phase !== 'arrived')) return
    const i = window.setInterval(() => {
      setProgress((p) => ({
        me: phase === 'arrived' ? 1 : Math.min(1, p.me + 0.02),
        them: Math.min(1, p.them + (phase === 'arrived' ? 0.06 : 0.016)),
      }))
    }, 500)
    return () => window.clearInterval(i)
  }, [phase])

  const startMeetup = useCallback((m: Omit<Meetup, 'startLabel' | 'endLabel'> & { startsInMin: number }) => {
    haptic('success')
    setMatchFlash(m.person)
    setIncoming(null)
    setRequests([])
    setHosting(null)
    setTab('map')
    setCreateStep(0)
    window.setTimeout(() => {
      setMatchFlash(null)
      setMeetup({
        person: m.person,
        venueId: m.venueId,
        intent: m.intent,
        durationMin: m.durationMin,
        startLabel: clockIn(m.startsInMin),
        endLabel: clockIn(m.startsInMin + m.durationMin),
      })
      setProgress({ me: 0, them: 0 })
      msgId.current = 1
      setMessages([{ id: 0, from: 'them', text: 'On my way!' }])
      setPhase('live')
    }, 1700)
  }, [])

  const actions = useMemo(
    () => ({
      recenterMap(){setRecenterKey(k=>k+1)},
      requestLocation(){},
      dismissLocation(){},
      setPushEnabled(enabled:boolean){},
      setAudience(value:'friends'|'public'|'both'){setAudience(value)},
      saveSetting(key:string,value:boolean){},
      saveInterests(interests:string[]){setUser(u=>({...u,interests}))},
      setTrustedContact(email:string){},
      completeOnboarding(profile: UserProfile) {
        setUser(profile)
        setOnboarded(true)
        haptic('success')
      },
      setTab(t: Tab) {
        haptic('tap')
        if(t==='messages'){setMessageTarget(null);setSelectedScheduledPostId(null)}
        setTab(t)
      },
      openMessages(target:'live'|'scheduled',postId?:string){setMessageTarget(target);setSelectedScheduledPostId(postId??null);setTab('messages')},
      closeMessages(){setMessageTarget(null);setSelectedScheduledPostId(null)},
      setFree(on: boolean) {
        setPhase(on ? 'free' : 'idle')
        if (!on) setIncoming(null)
      },
      setFreeForMin,
      passOffer() {
        setIncoming(null)
        setOfferIndex((i) => i + 1)
      },
      acceptOffer(offer: Offer) {
        startMeetup({
          person: offer.person,
          venueId: offer.venueId,
          intent: offer.intent,
          durationMin: offer.durationMin,
          startsInMin: offer.startsInMin,
        })
      },
      openCreate(mode: 'instant' | 'scheduled' = 'instant') {
        haptic('select')
        setCreateMode(mode)
        setCreateModeLocked(mode === 'scheduled')
        if (mode === 'scheduled') setScheduledPostNotice(null)
        setDraft(DEFAULT_DRAFT)
        setCreateStep(1)
      },
      chooseCreateMode(mode: 'instant' | 'scheduled') { if (!createModeLocked) setCreateMode(mode) },
      closeCreate() {
        setCreateStep(0)
      },
      setCreateStep,
      updateDraft(patch: Partial<Draft>) {
        setDraft((d) => ({ ...d, ...patch }))
      },
      publishScheduled() { showToast('Sign in to create a scheduled invite.') },
      cancelScheduledPlan() { showToast('Sign in to manage a scheduled invite.') },
      dismissScheduledPostNotice() { setScheduledPostNotice(null) },
      publish() {
        haptic('success')
        setHosting(draft)
        setRequests([])
        setIncoming(null)
        setCreateStep(0)
        setTab('map')
        setPhase('hosting')
      },
      cancelHosting() {
        setHosting(null)
        setRequests([])
        setPhase('idle')
      },
      rejectRequest(id: string) {
        haptic('tap')
        setRequests((r) => r.filter((x) => x.id !== id))
      },
      acceptRequest(req: JoinRequest) {
        if (!hosting) return
        startMeetup({
          person: req.person,
          venueId: hosting.venueId ?? 'kin',
          intent: hosting.intent ?? 'coffee',
          durationMin: hosting.durationMin,
          startsInMin: Math.max(req.person.walkMin, 8),
        })
      },
      joinOpen(args: { person: Person; venueId: string; intent: IntentId; durationMin: number; startsInMin: number }) {
        startMeetup(args)
      },
      imHere() {
        haptic('success')
        setProgress((p) => ({ ...p, me: 1 }))
        setPhase('arrived')
      },
      endMeetup() {
        setPhase('rating')
      },
      reportMeetup(reason:string,block=false){showToast(block?'Member blocked in preview.':'Report preview: '+reason)},
      cancelMeetup(reason?: string) {
        setMeetup(null)
        setMessages([])
        setPhase('idle')
        showToast(reason ?? 'UpCatch cancelled. No penalty this time.')
      },
      submitFeedback(rating: number | null,_met: boolean | null,_noShow = false) {
        if(meetup && rating){setHistory(h=>[{id:'h'+Date.now(),person:meetup.person,intent:meetup.intent,venueId:meetup.venueId,rating,when:'Just now'},...h])}
        setMeetup(null);setMessages([]);setPhase('idle');showToast('Thanks for your feedback.')
      },
      submitRating(rating: number) {
        if (meetup) {
          setHistory((h) => [
            { id: `h${Date.now()}`, person: meetup.person, intent: meetup.intent, venueId: meetup.venueId, rating, when: 'Just now' },
            ...h,
          ])
        }
        setMeetup(null)
        setMessages([])
        setPhase('idle')
        showToast('Thanks! Your rating keeps UpCatch safe.')
      },
      sendMessage(text: string) {
        const id = msgId.current++
        setMessages((m) => [...m, { id, from: 'me', text }])
        window.setTimeout(() => {
          const rid = msgId.current++
          setMessages((m) => [...m, { id: rid, from: 'them', text: AUTO_REPLIES[rid % AUTO_REPLIES.length] }])
          haptic('select')
        }, 1600)
      },
      sendScheduledMessage(text:string,postId?:string){showToast('Sign in to message a scheduled meetup.')},
      showToast,
      toggleBrand() {
        haptic('select')
        setBrandOpen((o) => !o)
      },
      openFriends(mode: 'show' | 'scan', target?: Person) {
        haptic('select')
        setFriendsSheet({ mode, target: target ?? personById('maya') })
      },
      async refreshFriends() {},
      closeFriends() {
        setFriendsSheet(null)
      },
      addFriend(person: Person) {
        haptic('success')
        setFriends((f) =>
          f.some((x) => x.person.id === person.id)
            ? f
            : [{ person, status: 'free', where: `${person.distanceKm} km · nearby`, since: 'Friends since today' }, ...f],
        )
      },
      removeFriend(id: string) {
        haptic('warning')
        setFriends((f) => f.filter((x) => x.person.id !== id))
      },
      dismissFriendAlert() {
        setFriendAlert(null)
      },
      joinFriend(friend: Friend) {
        setFriendAlert(null)
        startMeetup({
          person: friend.person,
          venueId: 'kin',
          intent: 'coffee',
          durationMin: 45,
          startsInMin: 20,
        })
      },
      resetDemo() {
        friendAlertShown.current = false
        setFriendAlert(null)
        setFriendsSheet(null)
        setOnboarded(false)
        setPhase('idle')
        setTab('map')
        setMeetup(null)
        setHosting(null)
        setRequests([])
        setIncoming(null)
      },
    }),
    [draft, hosting, meetup, showToast, startMeetup],
  )


  const [creationType,setCreationType]=useState<'manual'|'auto'>('auto')
  const [recenterKey,setRecenterKey]=useState(0)
  const [badgeStats,setBadgeStats]=useState<Record<string,number>>({})
  const [profileStats,setProfileStats]=useState<ProfileStats>({completed_meetups:initial?.completedMeetups??0,rating:null,rating_count:0,show_up_percent:null})
  const [audience,setAudience]=useState<'friends'|'public'|'both'>('both')
  const [memberSettings,setMemberSettings]=useState<Record<string,boolean>>({verifiedOnly:false,share:false,hideAge:false,notifyFriends:true,friendMeetups:true,friendsFirst:true})
  const [blockedCount,setBlockedCount]=useState(0)
  const [trustedEmail,setTrustedEmail]=useState<string|null>(null)
  const [locationStatus,setLocationStatus]=useState<'unknown'|'granted'|'denied'|'loading'|'unavailable'>('unknown')
  const [pushEnabled,setPushEnabledState]=useState(initial?.pushEnabled??false)
  const [pushBusy,setPushBusy]=useState(false)
  const pushPending=useRef(false)
  const [locationPrompt,setLocationPrompt]=useState(false)
  const [locationCenter,setLocationCenter]=useState<[number,number]|undefined>()
  const locationRequest=useRef<Promise<boolean>|null>(null)
  const savedLocation=useRef<[number,number]|null>(null)
  const requestLocation=useCallback((showPrompt=true,refresh=false):Promise<boolean>=>{
    if(savedLocation.current&&!refresh){setLocationPrompt(false);return Promise.resolve(true)}
    if(locationRequest.current)return locationRequest.current
    if(showPrompt&&!savedLocation.current)setLocationPrompt(true)
    if(!savedLocation.current)setLocationStatus('loading')
    const pending=(async()=>{
      try{
        const center=await saveBrowserLocation()
        savedLocation.current=center
        setLocationCenter(center);setLocationStatus('granted');setLocationPrompt(false)
        return true
      }catch(error){
        if(savedLocation.current&&!(error instanceof LocationError&&error.status==='denied')){
          setLocationStatus('granted');return true
        }
        savedLocation.current=null
        setLocationStatus(error instanceof LocationError?error.status:'unavailable')
        if(showPrompt){setLocationPrompt(true);showToast(error instanceof Error?error.message:'Your location could not be saved. Please retry.')}
        return false
      }finally{locationRequest.current=null}
    })()
    locationRequest.current=pending
    return pending
  },[showToast])
  useEffect(()=>{
    if(!initial||!onboarded)return
    return observeLocationPermission(permission=>{
      if(permission==='granted')void requestLocation(false)
      else if(permission!=='unknown'){
        savedLocation.current=null
        setLocationStatus(permission==='denied'?'denied':'unknown')
        setLocationCenter(undefined)
      }
    })
  },[initial,onboarded,requestLocation])
  useEffect(()=>{
    if(!initial||!onboarded)return
    if(initial.pushEnabled)void restorePush().catch(()=>undefined)
    const {data:{subscription}}=createClient().auth.onAuthStateChange(event=>{
      if(event==='SIGNED_OUT')void detachPush().catch(()=>undefined)
    })
    return()=>subscription.unsubscribe()
  },[initial,onboarded])
  const [liveMatch,setLiveMatch]=useState<LiveState['meetup']>(null)
  const [feedbackStatus,setFeedbackStatus]=useState<'completed'|'cancelled'|null>(null)
  const busy = useRef(false)
  const [availabilityBusy,setAvailabilityBusy]=useState(false)
  const availabilityPending=useRef(false)
  const seenOnlineFriends=useRef(new Set<string>())
  const liveCommands = useRef<Promise<boolean>>(Promise.resolve(false))
  const previousMatch = useRef<Meetup | null>(null)
  const seenScheduledPlans = useRef(new Set<string>())
  const snapshot = useRef<LiveState | null>(null)
  const snapshotVersion=useRef(0)
  const makePerson = useCallback((name: string, id: string): Person => ({
    id,name,initials:name.trim().slice(0,2).toUpperCase(),age:0,photo:'',bio:'',interests:[],distanceKm:0,
    approx:initial?.center??[0,0],walkMin:0,driveMin:0,rating:0,meetups:0,
    verified:{id:false,photo:false,phone:false},compatibility:0,lookFor:'Say hello at the agreed venue',
  }),[initial])
  const refreshLive = useCallback(async () => {
    if(!initial || !onboarded)return
    const version=++snapshotVersion.current
    const client=createClient()
    const [{data,error},{data:plans,error:planError}]=await Promise.all([
      client.rpc('my_live_state'),client.rpc('my_scheduled_plans'),
    ])
    if(error){showToast('Meetup status could not be loaded. Please try again.');return}
    if(planError){showToast('Scheduled meetup status could not be loaded. Please try again.');return}
    if(version!==snapshotVersion.current)return
    const s=data as LiveState
    const nextPlans=(plans??[]) as ScheduledPlan[]
    const nextPlan=nextPlans[0]??null
    const scheduledResults=await Promise.all(nextPlans.map(async item=>({postId:item.post_id,result:await client.rpc('list_scheduled_messages',{p_post:item.post_id})})))
    if(version!==snapshotVersion.current)return
    setScheduledPlan(nextPlan)
    setScheduledPlans(nextPlans)
    const nextMessageMap:Record<string,Message[]>={}
    for(const item of scheduledResults){
      if(item.result.error){showToast('Scheduled messages could not be loaded. Please try again.');continue}
      nextMessageMap[item.postId]=(item.result.data??[]).map((row:{id:number;body:string;sender_is_me:boolean})=>({id:row.id,from:row.sender_is_me?'me':'them',text:row.body}))
    }
    setScheduledMessageMap(nextMessageMap)
    setScheduledMessages(nextPlan ? nextMessageMap[nextPlan.post_id]??[] : [])
    const unseen=nextPlans.find(item=>!seenScheduledPlans.current.has(item.post_id))
    nextPlans.forEach(item=>seenScheduledPlans.current.add(item.post_id))
    if(unseen){
      if(!s.meetup && !s.feedback_pending){
        setScheduledPlanFlash(unseen)
        setTimeout(()=>setScheduledPlanFlash(null),1700)
      }
    }
    const before=snapshot.current?.meetup
    snapshot.current=s
    setCreationType(s.meetup?.creation_type??s.queue?.creation_type??'auto')
    setBadgeStats(s.stats??{})
    if(s.profile_stats)setProfileStats(s.profile_stats)
    setLiveMatch(s.meetup)
    if(s.queue && ['coffee','lunch','drink'].includes(s.queue.intent))setFreeForMin(s.queue.intent==='coffee'?30:s.queue.intent==='lunch'?60:120)
    setMessages((s.messages??[]).slice().sort((a,b)=>a.id-b.id))
    if(s.settings){setAudience(s.settings.audience??'both');setMemberSettings(current=>({...current,...(s.settings?.prefs??{})}));setTrustedEmail(s.settings.trusted_email??null);setUser(u=>({...u,age:s.settings?.age??u.age,interests:s.settings?.interests??u.interests}))}
    setBlockedCount(s.blocked_count??0)
    const currentFriends=(s.friends??[]).map(f=>({person:{...makePerson(f.name,f.id),photo:'/api/friend-photo?id='+encodeURIComponent(f.id)},status:f.status,where:f.status==='free'?'Online':'Offline',since:''}))
    setFriends(currentFriends)
    const onlineIds=new Set(currentFriends.filter(f=>f.status==='free').map(f=>f.person.id))
    for(const id of seenOnlineFriends.current)if(!onlineIds.has(id))seenOnlineFriends.current.delete(id)
    if(s.settings?.prefs?.friendMeetups && !s.meetup && !s.awaiting_offer){
      const newlyOnline=currentFriends.find(f=>f.status==='free'&&!seenOnlineFriends.current.has(f.person.id))
      if(newlyOnline){seenOnlineFriends.current.add(newlyOnline.person.id);setFriendAlert(current=>current??newlyOnline)}
    }
    void fetch('/api/notifications',{method:'POST'}).catch(()=>undefined)
    const histories=s.history.filter(h=>h.status==='completed').map(h=>({id:h.id,creationType:h.creation_type,person:makePerson(h.other_name??'Your meetup',h.id),intent:h.intent,venueId:initial.venues.find(v=>v.name===h.venue)?.id??'',rating:h.rating??0,when:new Date(h.ends_at).toLocaleDateString('en-GB',{timeZone:initial.timezone})}))
    setHistory(histories)
    if(s.feedback_pending){
      const h=s.history.find(item=>item.id===s.feedback_pending?.id)
      const old=previousMatch.current?.person.id===s.feedback_pending.id?previousMatch.current:null
      const feedbackMeetup:Meetup|null=old??(h?{person:{...makePerson(h.other_name??'Your meetup',h.id),photo:'/api/member-photo?meetup='+encodeURIComponent(h.id)},venueId:'',intent:h.intent,durationMin:Math.round((Date.parse(h.ends_at)-Date.parse(h.starts_at))/60000),startLabel:new Date(h.starts_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:initial.timezone}),endLabel:new Date(h.ends_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:initial.timezone})}:null)
      setFeedbackStatus(s.feedback_pending.status)
      setIncoming(null);setHosting(null);setMeetup(feedbackMeetup);setPhase('rating')
      return
    }
    setFeedbackStatus(null)
    const m=s.meetup
    if(m){
      const venue=m.venue ? initial.venues.find(v=>v.name===m.venue?.name) : undefined
      // Venue selection is left to members in chat; it never blocks a match.
      const next:Meetup={person:{...makePerson(m.other_name,m.id),age:m.other_age??0,interests:m.other_interests??[],verified:{id:m.other_verified??false,photo:false,phone:false},showUpPercent:m.other_show_up_percent??null,ratingReceived:m.other_rating??null,photo:'/api/member-photo?meetup='+encodeURIComponent(m.id)},venueId:venue?.id??'',intent:m.intent,durationMin:Math.round((Date.parse(m.ends_at)-Date.parse(m.starts_at))/60000),startLabel:new Date(m.starts_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:initial.timezone}),endLabel:new Date(m.ends_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:initial.timezone})}
      previousMatch.current=next
      if(m.status==='draft'){
        setMeetup(null);setHosting(null);setPhase('free')
        setIncoming({person:next.person,venueId:next.venueId,intent:next.intent,durationMin:next.durationMin,startsInMin:0,note:m.accepted?'You accepted. Waiting for them.':(m.note||'Accept to confirm this meetup.')} as Offer)
      }else{
        if(!before || before.status==='draft'){setMatchFlash(next.person);setTimeout(()=>setMatchFlash(null),1700)}
        setIncoming(null);setHosting(null);setMeetup(next);setProgress({me:m.arrived?1:0,them:m.other_arrived?1:0});setPhase(m.arrived?'arrived':'live')
      }
    }else if(s.awaiting_offer){
      setIncoming(null);setMeetup(null);setHosting(null);setPhase('free')
    }else if(s.queue){
      setIncoming(null);setMeetup(null)
      if(s.queue.venue_id){setHosting({ ...DEFAULT_DRAFT,intent:s.queue.intent,venueId:s.queue.venue_id,durationMin:s.queue.duration_min,windowMin:s.queue.duration_min });setPhase('hosting')}else{setHosting(null);setPhase('free')}
      const completed=previousMatch.current&&s.history.find(h=>h.id===previousMatch.current?.person.id&&h.status==='completed'&&h.rating===null)
      if(completed){setMeetup(previousMatch.current);setPhase('rating')}
    }else{
      setIncoming(null);setHosting(null)
      const completed=previousMatch.current&&s.history.find(h=>h.id===previousMatch.current?.person.id&&h.status==='completed'&&h.rating===null)
      if(completed){setMeetup(previousMatch.current);setPhase('rating')}
      else {setMeetup(null);setPhase('idle')}
    }
  },[initial,onboarded,makePerson,showToast])
  useEffect(()=>{
    if(!initial || !onboarded)return
    let stopped=false
    let timer:ReturnType<typeof setTimeout>
    const poll=async()=>{
      if(document.visibilityState==='visible'&&!busy.current)await refreshLive().catch(()=>undefined)
      if(stopped)return
      const searching=Boolean(snapshot.current?.queue||snapshot.current?.awaiting_offer||snapshot.current?.meetup?.status==='draft'||snapshot.current?.meetup?.status==='confirmed')
      timer=setTimeout(()=>{void poll()},searching?3000:8000)
    }
    void poll()
    return()=>{stopped=true;clearTimeout(timer)}
  },[initial,onboarded,refreshLive])
  const commandLive=useCallback((command:string,args:Record<string,unknown>={})=>{
    const pending=liveCommands.current.then(async()=>{
      busy.current=true
      ++snapshotVersion.current
      try{
        const client=createClient()
        const {error}=command==='live'
          ? await client.rpc('go_online',{p_intent:args.p_intent,p_duration:args.p_duration})
          : command==='cancel'&&snapshot.current?.meetup?.status==='confirmed'
            ? await client.rpc('cancel_current_meetup')
          : command==='search'
            ? await client.rpc('update_matching_search',args)
            : command==='feedback'&&args.p_meetup
              ? await client.rpc('complete_meetup_feedback',{p_meetup:args.p_meetup,p_rating:args.p_rating??null,p_met:args.p_met??null,p_no_show:args.p_no_show??false})
            : command==='rate'&&args.p_meetup
              ? await client.rpc('rate_meetup',{p_meetup:args.p_meetup,p_rating:args.p_rating})
              : await client.rpc('meetup_command',{p_command:command,...args})
        if(error){
          showToast(error.code==='P0001'?error.message:'Could not save this action. Please try again.')
          await refreshLive().catch(()=>undefined)
          return false
        }
        await refreshLive().catch(()=>showToast('Your action was saved. Reconnecting to the latest meetup status.'))
        return true
      }catch{showToast('Connection lost. Please try again.');return false}
      finally{busy.current=false}
    })
    liveCommands.current=pending
    return pending
  },[refreshLive,showToast])
  const saveSettings=async(patch:Record<string,unknown>)=>{const {error}=await createClient().rpc('save_member_settings',{p_patch:patch});if(error){showToast(error.code==='P0001'?error.message:'Setting could not be saved.');return}await refreshLive()}
  const realActions=initial?{
    ...actions,
    requestLocation,
    dismissLocation(){setLocationPrompt(false)},
    openCreate(mode: 'instant' | 'scheduled' = 'instant'){if(mode==='instant'&&snapshot.current?.meetup){showToast('Finish or cancel your current invite first.');return}actions.openCreate(mode);setTab('map')},
    chooseCreateMode(mode: 'instant' | 'scheduled'){if(mode==='instant'&&snapshot.current?.meetup){showToast('Finish or cancel your current invite first.');return}actions.chooseCreateMode(mode)},
    recenterMap(){if(savedLocation.current){void requestLocation(false,true);setRecenterKey(k=>k+1)}else if(locationRequest.current){void locationRequest.current.then(ok=>{if(ok)setRecenterKey(k=>k+1)})}else setLocationPrompt(true)},
    setAudience(value:'friends'|'public'|'both'){setAudience(value);void commandLive('search',{p_audience:value})},
    setPushEnabled(enabled:boolean){void (async()=>{
      if(pushPending.current)return
      pushPending.current=true;setPushBusy(true)
      try{await changePushEnabled(enabled);setPushEnabledState(enabled);showToast(enabled?'Notifications enabled.':'Notifications turned off.')}
      catch(error){showToast(error instanceof Error?error.message:'Notification preference could not be saved.')}
      finally{pushPending.current=false;setPushBusy(false)}
    })()},
    saveSetting(key:string,value:boolean){void (async()=>{
      if(pushPending.current)return
      pushPending.current=true;setPushBusy(true)
      try{
        if(value&&key==='friendMeetups'){await changePushEnabled(true);setPushEnabledState(true)}
        await saveSettings({[key]:value})
      }catch(error){showToast(error instanceof Error?error.message:'Setting could not be saved.')}
      finally{pushPending.current=false;setPushBusy(false)}
    })()},
    saveInterests(interests:string[]){void saveSettings({interests})},
    setTrustedContact(email:string){void saveSettings({trustedEmail:email,share:true})},
    setFree(on:boolean){
      if(availabilityPending.current)return
      availabilityPending.current=true;setAvailabilityBusy(true)
      void (async()=>{
        try{
          if(on&&!savedLocation.current){
            if(!locationRequest.current){setLocationPrompt(true);return}
            if(!await locationRequest.current)return
          }
          await commandLive(on?'live':'offline',on?{p_venue:null,p_intent:freeForMin===30?'coffee':freeForMin===60?'lunch':'drink',p_duration:freeForMin}:{})
        }finally{availabilityPending.current=false;setAvailabilityBusy(false)}
      })()
    },
    setFreeForMin(minutes:number){setFreeForMin(minutes);if(snapshot.current?.queue||snapshot.current?.awaiting_offer||snapshot.current?.meetup?.status==='draft')void commandLive('search',{p_intent:minutes===30?'coffee':minutes===60?'lunch':'drink',p_duration:minutes})},
    publishScheduled(){
      if(busy.current)return
      const date=new Date(draft.scheduledAt)
      if(!draft.intent){showToast('Choose an activity.');return}
      if(!draft.note.trim()){showToast('Write a short invite.');return}
      if(!Number.isFinite(date.getTime())){showToast('Choose a date and time.');return}
      busy.current=true;setScheduledBusy(true)
      void (async()=>{try{
        const {error}=await createClient().rpc('create_scheduled_post',{p_intent:draft.intent,p_starts_at:date.toISOString(),p_note:draft.note.trim(),p_duration:draft.durationMin,p_radius:draft.radiusKm,p_preferences:draft.prefs})
        if(error){showToast(error.code==='P0001'?error.message:'Could not create your invite. Please retry.');return}
        void fetch('/api/notifications',{method:'POST'}).catch(()=>undefined)
        setScheduledPostNotice('Your scheduled invite is live on the Wall.')
        setCreateStep(0);setTab('wall')
      }catch{showToast('Connection lost. Please try again.')}finally{busy.current=false;setScheduledBusy(false)}})()
    },
    cancelScheduledPlan(postId:string){
      void (async()=>{
        const {error}=await createClient().rpc('cancel_scheduled_plan',{p_post:postId})
        if(error){showToast(error.code==='P0001'?error.message:'Could not cancel this invite. Please retry.');return}
        setScheduledPlan(null)
        await refreshLive()
        showToast('Scheduled invite cancelled.')
      })()
    },
    publish(){if(locationStatus!=='granted'){setLocationPrompt(true);return}if(busy.current)return;busy.current=true;void (async()=>{try{const {error}=await createClient().rpc('publish_availability',{p_intent:draft.intent,p_duration:draft.durationMin,p_window:draft.windowMin,p_radius:draft.radiusKm,p_note:draft.note,p_preferences:draft.prefs});if(error){showToast(error.code==='P0001'?error.message:'Unable to go online. Please retry.');return}setCreateStep(0);setTab('map');await refreshLive()}finally{busy.current=false}})()},
    passOffer(){void commandLive('pass')},
    acceptOffer(){void commandLive('accept')},
    acceptRequest(){void commandLive('accept')},
    rejectRequest(){void commandLive('cancel')},
    cancelHosting(){void commandLive(snapshot.current?.meetup?'cancel':'offline')},
    imHere(){void commandLive('arrive')},
    endMeetup(){void commandLive('finish')},
    cancelMeetup(){void commandLive('cancel')},
    reportMeetup(reason:string,block=false){
      if(busy.current)return
      busy.current=true
      void (async()=>{try{const {error}=await createClient().rpc('report_current_meetup',{p_reason:reason,p_block:block});if(error){showToast('Report could not be saved. Please try again.');return}await refreshLive();showToast(block?'Member blocked and meetup cancelled.':'Report saved for review. Meetup cancelled.')}catch{showToast('Connection lost. Please try again.')}finally{busy.current=false}})()
    },
    submitFeedback(rating:number|null,met:boolean|null,noShow=false){const pending=snapshot.current?.feedback_pending;if(!pending){showToast('Feedback is no longer pending.');return}void commandLive('feedback',{p_meetup:pending.id,p_rating:rating,p_met:met,p_no_show:noShow}).then(saved=>{if(saved)showToast('Thanks for your feedback.')})},
    submitRating(rating:number){if(rating===0){previousMatch.current=null;setMeetup(null);setPhase('idle');return}const id=previousMatch.current?.person.id;if(!id){showToast('Reload your meetup before rating.');return}void commandLive('rate',{p_meetup:id,p_rating:rating}).then(saved=>{if(saved)showToast('Thanks! Your rating was saved.')})},
    sendMessage(text:string){void createClient().rpc('send_meetup_message',{p_text:text}).then(async({error})=>{if(error){showToast(error.code==='P0001'?error.message:'Message could not be sent.');return}void fetch('/api/notifications',{method:'POST'}).catch(()=>undefined);await refreshLive()})},
    sendScheduledMessage(text:string,postId?:string){const id=postId??scheduledPlan?.post_id;if(!id){showToast('This chat is no longer available.');return}void createClient().rpc('send_scheduled_message',{p_post:id,p_text:text}).then(async({error})=>{if(error){showToast(error.code==='P0001'?error.message:'Message could not be sent.');return}void fetch('/api/notifications',{method:'POST'}).catch(()=>undefined);await refreshLive()})},
    joinOpen(){showToast('Go online to find your next meetup.')},
    joinFriend(){if(locationStatus!=='granted'){setLocationPrompt(true);return}void commandLive('search',{p_audience:'friends'}).then(saved=>{if(saved)void commandLive('live',{p_venue:null,p_intent:freeForMin===30?'coffee':freeForMin===60?'lunch':'drink',p_duration:freeForMin})})},
    addFriend(person:Person){showToast('Scan their QR code to send a friend request.')},
    refreshFriends:refreshLive,
    removeFriend(id:string){void createClient().rpc('remove_friend',{p_user:id}).then(({error})=>{if(error)showToast('Unable to remove friend.');else void refreshLive()})},
    openFriends(mode:'show'|'scan',target?:Person){haptic('select');setFriendsSheet({mode,target:target??makePerson(user.name,'my-code')})},
    resetDemo(){void detachPush().catch(()=>undefined).then(()=>createClient().auth.signOut()).then(()=>window.location.assign('/auth/login'))},
  }:actions

  return {
    state: {
      creationType,recenterKey,badgeStats,profileStats,audience,memberSettings,blockedCount,trustedEmail,
      locationStatus,locationPrompt,locationCenter,pushEnabled,pushBusy,availabilityBusy,
      liveMatch,feedbackStatus,
      live: initial,
      liveVenues: initial?.venues,
      onboarded,
      user,
      tab,
      phase,
      freeForMin,
      createStep,
      createMode,
      createModeLocked,
      scheduledBusy,
      scheduledPostNotice,
      scheduledPlan,
      scheduledPlans,
      scheduledPlanFlash,
      scheduledMessages,scheduledMessageMap,messageTarget,selectedScheduledPostId,
      draft,
      hosting,
      incoming,
      requests,
      meetup,
      progress,
      matchFlash,
      history,
      messages,
      toast,
      friends,
      friendsSheet,
      friendAlert,
      brandOpen,
    },
    actions: realActions,
  }
}

type Ctx = ReturnType<typeof useUpCatchState>
const UpCatchContext = createContext<Ctx | null>(null)

export function UpCatchProvider({ children, initial }: { children: ReactNode; initial?: LiveBootstrap }) {
  const value = useUpCatchState(initial)
  return <UpCatchContext.Provider value={value}>{children}</UpCatchContext.Provider>
}

export function useUpCatch() {
  const ctx = useContext(UpCatchContext)
  if (!ctx) throw new Error('useUpCatch must be used within UpCatchProvider')
  return ctx
}

export function useVenueLookup(){
 const {state}=useUpCatch()
 return (id:string)=>state.liveVenues ? (state.liveVenues.find(v=>v.id===id)??{id,name:id?'Venue unavailable':'Meetup',address:'',kind:'restaurant' as const,kindLabel:'Public venue',position:[NaN,NaN] as [number,number],image:'/placeholder.svg',walkMin:0,driveMin:0,distanceKm:0,safety:'',intents:[],verified:false}) : venueFallback(id)
}
