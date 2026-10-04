'use client'
import { useEffect, useRef, useState } from 'react'
import { restorePush, setPushEnabled, detachPush } from '@/lib/push-client'
import { createClient } from '@/lib/supabase/client'
import { signOut } from '@/app/auth/actions'
import { InstallAppProvider, InstallAppCard, NotificationHelp } from './install-app'
export function PushSettings({initialEnabled}:{initialEnabled:boolean}) {
  const [enabled,setEnabled]=useState(initialEnabled),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
  const pending=useRef(false)
  useEffect(()=>{
    if(initialEnabled)void restorePush().catch(()=>undefined)
    const {data:{subscription}}=createClient().auth.onAuthStateChange(event=>{
      if(event==='SIGNED_OUT')void detachPush().catch(()=>undefined)
    })
    return()=>subscription.unsubscribe()
  },[initialEnabled])
  async function toggle(){
    if(pending.current)return
    pending.current=true;setBusy(true);setMessage('')
    try{await setPushEnabled(!enabled);setEnabled(!enabled);setMessage(enabled?'Notifications turned off.':'Notifications enabled.')}
    catch(error){setMessage(error instanceof Error?error.message:'Notifications could not be updated.')}
    finally{pending.current=false;setBusy(false)}
  }
  async function logout(){
    setBusy(true)
    try{await detachPush()}catch{setMessage('Could not disconnect this device from notifications. Please retry.');setBusy(false);return}
    await signOut()
  }
  return <InstallAppProvider><div className="space-y-4">
    <button onClick={toggle} disabled={busy} className="w-full rounded-xl border border-border p-3 font-semibold disabled:opacity-50">{busy?'Please wait?':enabled?'Turn off notifications':'Enable notifications'}</button>
    {message&&<p role="status" className="text-sm text-muted-foreground">{message}</p>}
    <NotificationHelp />
    <InstallAppCard />
    <button onClick={logout} disabled={busy} className="text-sm text-muted-foreground">Sign out</button>
  </div></InstallAppProvider>
}
