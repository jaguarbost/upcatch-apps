'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Analytics } from '@vercel/analytics/next'
import { PrimaryButton } from '@/components/upcatch/primitives'
const KEY='upcatch-analytics-consent-v1'
const OPEN_SETTINGS='upcatch:open-privacy-settings'
export function PrivacySettingsButton(){
 return <button type="button" onClick={()=>window.dispatchEvent(new Event(OPEN_SETTINGS))} className="font-semibold text-primary underline">Change privacy settings</button>
}
export function PrivacyConsent(){
 const [choice,setChoice]=useState<string|null>(null),[ready,setReady]=useState(false),[open,setOpen]=useState(false)
 useEffect(()=>{try{setChoice(localStorage.getItem(KEY))}catch{}setReady(true)},[])
 useEffect(()=>{const show=()=>setOpen(true);window.addEventListener(OPEN_SETTINGS,show);return()=>window.removeEventListener(OPEN_SETTINGS,show)},[])
 function choose(value:'accepted'|'rejected'){try{localStorage.setItem(KEY,value)}catch{}setChoice(value);setOpen(false)}
 if(!ready)return null
 return <>
 {choice==='accepted'&&process.env.NODE_ENV==='production'&&<Analytics/>}

 {(open||!['accepted','rejected'].includes(choice??''))&&<section aria-label="Privacy preferences" className="fixed inset-x-3 bottom-14 z-[110] mx-auto max-w-lg rounded-3xl border border-border bg-card p-5 shadow-xl">
 <h2 className="font-display text-xl font-extrabold">Your privacy choices</h2>
 <p className="my-3 text-sm text-muted-foreground">Essential storage keeps you signed in and remembers this choice. Optional Vercel analytics helps us understand site usage and loads only if you allow it. <Link href="/privacy" className="font-bold text-primary underline">Privacy notice</Link> and <Link href="/terms" className="font-bold text-primary underline">terms of use</Link>.</p>
 <div className="flex gap-3"><PrimaryButton variant="soft" onClick={()=>choose('rejected')} className="flex-1">Reject optional</PrimaryButton><PrimaryButton onClick={()=>choose('accepted')} className="flex-1">Allow analytics</PrimaryButton></div>
 <p className="mt-3 text-xs text-muted-foreground">Change your choice at any time on the <Link href="/privacy" className="text-primary underline">privacy page</Link>.</p>
 </section>}</>
}
