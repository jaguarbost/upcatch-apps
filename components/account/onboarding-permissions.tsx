'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { MapPin } from 'lucide-react'
import { PrimaryButton } from '@/components/upcatch/primitives'
import { LocationError, saveBrowserLocation } from '@/lib/browser-location'
import { observeLocationPermission } from '@/lib/browser-permissions'
import { LocationHelp } from './location-help'
import { InstallAppCard } from './install-app'

export function OnboardingPermissions({ onLocation }: { onLocation: () => void }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [denied, setDenied] = useState(false)
  const inFlight = useRef(false)
  const complete = useRef(onLocation)
  complete.current = onLocation
  const mounted = useRef(false)
  const allowLocation = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true); setMessage('')
    try {
      await saveBrowserLocation()
      if (mounted.current) complete.current()
    } catch (error) {
      if (mounted.current) {
        setDenied(error instanceof LocationError && error.status === 'denied')
        setMessage(error instanceof Error ? error.message : 'Your location could not be saved. Please retry.')
      }
    } finally {
      inFlight.current = false
      if (mounted.current) setBusy(false)
    }
  }, [])
  useEffect(() => {
    mounted.current = true
    const stop = observeLocationPermission(permission => {
      setDenied(permission === 'denied')
      if (permission === 'granted') void allowLocation()
    })
    return () => { stop(); mounted.current = false }
  }, [allowLocation])
  return <div className="space-y-5">
    <span className="grid size-16 place-items-center rounded-2xl bg-live text-live-foreground"><MapPin className="size-8" aria-hidden="true" /></span>
    <p className="text-sm leading-relaxed text-muted-foreground">Location is required to continue and meet people nearby. We save your approximate area. Other members never see your exact position.</p>
    <PrimaryButton onClick={allowLocation} disabled={busy} className="w-full">{busy ? 'Finding your area?' : message ? 'Try location again' : 'Use my location'}</PrimaryButton>
    {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    {(denied || message) && <LocationHelp denied={denied} />}
    <p className="text-sm text-muted-foreground">Camera access is optional when adding a photo. You can turn on notifications later in your profile.</p>
    <InstallAppCard />
  </div>
}
