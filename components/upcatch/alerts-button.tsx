'use client'
import { Bell, MessageCircle } from 'lucide-react'
import { useUpCatch } from './app-provider'
export function AlertsButton(){
 const {state,actions}=useUpCatch()
 const count=state.requests.length+(state.incoming?1:0)
 return <button type="button" onClick={()=>actions.setTab('activity')} aria-label={count?'Alerts, '+count+' new':'Alerts'} aria-current={state.tab==='activity'?'page':undefined} className="press absolute right-4 top-[max(env(safe-area-inset-top),1rem)] z-35 grid size-12 place-items-center rounded-full bg-card/95 shadow-lg shadow-foreground/10 backdrop-blur">
  <Bell className="size-5" aria-hidden="true" />
  {count>0&&<span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-live text-[10px] font-bold text-live-foreground ring-2 ring-card">{count}</span>}
 </button>
}

export function MessagesButton(){
 const {state,actions}=useUpCatch()
 return <button type="button" onClick={()=>actions.setTab('messages')} aria-label="Messages" aria-current={state.tab==='messages'?'page':undefined} className="press absolute right-[4.5rem] top-[max(env(safe-area-inset-top),1rem)] z-35 grid size-12 place-items-center rounded-full bg-card/95 shadow-lg shadow-foreground/10 backdrop-blur">
  <MessageCircle className="size-5" aria-hidden="true" />
 </button>
}
