'use client'

import { ArrowLeft, MessageCircle, Send } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useUpCatch } from './app-provider'
import { PersonAvatar } from './primitives'

export function MessagesScreen() {
  const { state, actions } = useUpCatch()
  const [draft, setDraft] = useState('')
  const [friendMessages, setFriendMessages] = useState<Array<{id:number;from:'me'|'them';text:string}>>([])
  const [friendError, setFriendError] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const selectedPlan = state.scheduledPlans.find(plan => plan.post_id === state.selectedScheduledPostId) ?? state.scheduledPlan
  const friend = state.friends.find(item => item.person.id === state.friendChatId)
  const target = state.messageTarget === 'live' && state.meetup ? 'live'
    : state.messageTarget === 'scheduled' && selectedPlan ? 'scheduled' : state.friendChatId ? 'friend' : null
  const messages = target === 'live' ? state.messages : target === 'scheduled' ? state.scheduledMessageMap[selectedPlan!.post_id]??[] : target === 'friend' ? friendMessages : []
  const partner = target === 'live' ? state.meetup?.person.name : target === 'scheduled' ? selectedPlan?.partner_name : friend?.person.name ?? 'Friend'

  const refreshFriendMessages=useCallback(async()=>{
    if(!state.friendChatId)return
    const {data,error}=await createClient().rpc('list_friend_messages',{p_friend:state.friendChatId})
    if(error){setFriendError(error.code==='P0001'?error.message:'Could not load this chat. Please try again.');return}
    setFriendMessages(((data??[]) as Array<{id:number;body:string;sender_is_me:boolean}>).map(message=>({id:message.id,from:message.sender_is_me?'me':'them',text:message.body})))
    setFriendError('')
  },[state.friendChatId])
  useEffect(()=>{
    if(!state.friendChatId)return
    void refreshFriendMessages()
    const timer=window.setInterval(()=>{void refreshFriendMessages()},5000)
    return()=>window.clearInterval(timer)
  },[state.friendChatId,refreshFriendMessages])
  const lastId = messages.at(-1)?.id
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }) }, [target, lastId])
  useEffect(() => { setDraft('') }, [target])
  const hasAny = Boolean(state.meetup || state.scheduledPlans.length || state.friends.length || state.history.length)

  function send() {
    const text = draft.trim()
    if (!text || !target) return
    if (target === 'live') actions.sendMessage(text)
    else if(target === 'scheduled') actions.sendScheduledMessage(text,selectedPlan?.post_id)
    else if(state.friendChatId)void createClient().rpc('send_friend_message',{p_friend:state.friendChatId,p_text:text}).then(async({error})=>{
      if(error){setFriendError(error.code==='P0001'?error.message:'Message could not be sent.');return}
      void fetch('/api/notifications',{method:'POST'}).catch(()=>undefined)
      await refreshFriendMessages()
    })
    setDraft('')
  }

  return <main className="absolute inset-0 z-20 flex flex-col bg-background animate-in fade-in duration-200">
    <header className="flex items-center gap-3 px-5 pt-[max(env(safe-area-inset-top),1.25rem)] pb-3 lg:mx-auto lg:w-full lg:max-w-xl">
      {target && <button type="button" onClick={actions.closeMessages} aria-label="All messages" className="press grid size-11 place-items-center rounded-full bg-card"><ArrowLeft className="size-5" aria-hidden="true" /></button>}
      <h1 className="font-display text-3xl font-extrabold">{target ? partner : 'Messages'}</h1>
    </header>

    {target ? <div className="flex min-h-0 flex-1 flex-col pb-24 lg:mx-auto lg:w-full lg:max-w-xl">
      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-4" aria-label={`Messages with ${partner}`} aria-live="polite">
        {friendError && <p role="status" className="rounded-2xl bg-primary/10 p-3 text-sm text-primary">{friendError}</p>}
        {messages.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">{target==='friend'?'Say hello to your friend.':'Say hello and agree on a public meeting place.'}</p>}
        {messages.map(message => <p key={message.id} className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${message.from === 'me' ? 'self-end bg-primary text-primary-foreground' : 'self-start bg-card'}`}>{message.text}</p>)}
      </div>
      <form onSubmit={event => { event.preventDefault(); send() }} className="flex gap-2 border-t border-border bg-card px-4 py-3">
        <input value={draft} onChange={event => setDraft(event.target.value)} maxLength={80} aria-label={`Message ${partner}`} placeholder="Write a message…" className="h-12 min-w-0 flex-1 rounded-2xl bg-muted px-4 outline-none focus:ring-2 focus:ring-primary" />
        <button type="submit" disabled={!draft.trim()} aria-label="Send message" className="press grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground disabled:opacity-50"><Send className="size-5" aria-hidden="true" /></button>
      </form>
      <p className="bg-card px-4 pb-2 text-center text-xs text-muted-foreground">Keep phone numbers and other contact details out of chat.</p>
    </div> : <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 pb-28 lg:mx-auto lg:w-full lg:max-w-xl">
      {state.meetup && <button type="button" onClick={() => actions.openMessages('live')} className="press flex items-center gap-3 rounded-3xl bg-card p-3 text-left shadow-sm shadow-foreground/5">
        <PersonAvatar photo={state.meetup.person.photo} initials={state.meetup.person.initials} size={52} ring />
        <div className="min-w-0 flex-1"><p className="font-display font-bold">{state.meetup.person.name}</p><p className="text-sm text-muted-foreground">{state.messages.at(-1)?.text ?? 'Say hi before you meet up'}</p></div>
        <span className="rounded-full bg-live px-2 py-0.5 text-[10px] font-bold text-live-foreground">Live</span>
      </button>}
      {state.scheduledPlans.map(plan => <button key={plan.post_id} type="button" onClick={() => actions.openMessages('scheduled',plan.post_id)} className="press flex items-center gap-3 rounded-3xl bg-card p-3 text-left shadow-sm shadow-foreground/5">
        <PersonAvatar initials={plan.partner_name.slice(0,2).toUpperCase()} size={52} />
        <div className="min-w-0 flex-1"><p className="font-display font-bold">{plan.partner_name}</p><p className="text-sm text-muted-foreground">{state.scheduledMessageMap[plan.post_id]?.at(-1)?.text ?? 'Your scheduled invite is confirmed. Say hello.'}</p></div>
        <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">Planned</span>
      </button>)}
      {state.friends.map(item => <button key={item.person.id} type="button" onClick={() => actions.openFriendChat(item.person.id)} className="press flex items-center gap-3 rounded-3xl bg-card p-3 text-left shadow-sm shadow-foreground/5">
        <PersonAvatar photo={item.person.photo} initials={item.person.initials} size={52} />
        <div className="min-w-0 flex-1"><p className="font-display font-bold">{item.person.name}</p><p className="text-sm text-muted-foreground">Open your friend chat</p></div>
        <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">Friend</span>
      </button>)}
      {state.history.map(item => <div key={item.id} className="flex items-center gap-3 rounded-3xl bg-card p-3 opacity-80"><PersonAvatar photo={item.person.photo} initials={item.person.initials} size={52} /><div><p className="font-display font-bold">{item.person.name}</p><p className="text-sm text-muted-foreground">Chat ended · {item.when}</p></div></div>)}
      {!hasAny && <div className="flex flex-col items-center gap-4 px-6 py-16 text-center"><span className="grid size-20 place-items-center rounded-full bg-muted"><MessageCircle className="size-8 text-muted-foreground" aria-hidden="true" /></span><div><h2 className="font-display text-xl font-extrabold">No messages yet</h2><p className="mt-1 text-muted-foreground">Chats with the people you meet will show up here.</p></div></div>}
    </div>}
  </main>
}
