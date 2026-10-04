'use client'

import { MapPin } from 'lucide-react'
import { useUpCatch } from './app-provider'
import { PrimaryButton } from './primitives'
import { LocationHelp } from '@/components/account/location-help'

export function LocationPermission(){
  const {state,actions}=useUpCatch()
  const loading=state.locationStatus==='loading'
  return <div className="absolute inset-0 z-[80] flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm">
    <section role="dialog" aria-modal="true" aria-labelledby="location-title" aria-describedby="location-description" className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-[2rem] bg-card p-6 shadow-2xl">
      <span className="mb-5 grid size-14 place-items-center rounded-2xl bg-live text-live-foreground"><MapPin className="size-7" aria-hidden="true" /></span>
      <h2 id="location-title" className="font-display text-3xl font-extrabold">Enable your location</h2>
      <p id="location-description" className="mt-3 text-sm leading-relaxed text-muted-foreground">Location permission is required before going online. It helps place you on the map. Your exact location is not shown to other members.</p>
      {(state.locationStatus==='denied'||state.locationStatus==='unavailable') && <div className="mt-3"><LocationHelp denied={state.locationStatus==='denied'} /></div>}
      {state.locationStatus==='denied' && <p role="alert" className="mt-3 text-sm font-semibold">Location is blocked. Allow location in your browser’s site settings, then retry.</p>}
      {state.locationStatus==='unavailable' && <p role="alert" className="mt-3 text-sm font-semibold">We couldn’t get your location. Check your device’s location settings and connection, then retry.</p>}
      <PrimaryButton onClick={()=>{void actions.requestLocation()}} disabled={loading} className="mt-6 w-full" >{loading?'Getting location…':state.locationStatus==='denied'||state.locationStatus==='unavailable'?'Retry location':'Allow location'}</PrimaryButton>
      <button type="button" onClick={actions.dismissLocation} className="mt-4 w-full text-sm font-semibold text-muted-foreground">Stay offline for now</button>
    </section>
  </div>
}
