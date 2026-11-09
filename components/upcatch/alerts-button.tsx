'use client'
import { Bell, MessageCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useUpCatch } from './app-provider'
export function AlertsButton(){
 const {state,actions}=useUpCatch()
 const [unread,setUnread]=useState(0)
 useEffect(()=>{
  if(!state.live)return
  let active=true
  const refresh=()=>{void createClient().from('member_notifications').select('id',{count:'exact',head:true}).is('read_at',null).then(({count,error})=>{if(active&&!error)setUnread(count??0)})}
  refresh()
  const timer=window.setInterval(()=>{if(document.visibilityState==='visible')refresh()},30000)
  window.addEventListener('focus',refresh)
  window.addEventListener('upcatch:notifications-updated',refresh)
  return()=>{active=false;window.clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('upcatch:notifications-updated',refresh)}
 },[state.live])
 const count=state.requests.length+(state.incoming?1:0)+unread
 return <button type="button" onClick={()=>actions.setTab('notifications')} aria-label={count?'Notifications, '+count+' new':'Notifications'} aria-current={state.tab==='notifications'?'page':undefined} className="press absolute right-4 top-[max(env(safe-area-inset-top),1rem)] z-35 grid size-12 place-items-center rounded-full bg-card/95 shadow-lg shadow-foreground/10 backdrop-blur">
  <Bell className="size-5" aria-hidden="true" />
  {count>0&&<span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-live text-[10px] font-bold text-live-foreground ring-2 ring-card">{Math.min(count,99)}</span>}
 </button>
}

export function MessagesButton(){
 const {state,actions}=useUpCatch()
 return <button type="button" onClick={()=>actions.setTab('messages')} aria-label="Messages" aria-current={state.tab==='messages'?'page':undefined} className="press absolute right-[4.5rem] top-[max(env(safe-area-inset-top),1rem)] z-35 grid size-12 place-items-center rounded-full bg-card/95 shadow-lg shadow-foreground/10 backdrop-blur">
  <MessageCircle className="size-5" aria-hidden="true" />
 </button>
}
