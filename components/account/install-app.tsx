'use client'

import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Download } from 'lucide-react'
import { PrimaryButton } from '@/components/upcatch/primitives'
import { deviceKind, isInstalledApp, type DeviceKind } from '@/lib/browser-permissions'

type InstallEvent = Event & {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
type InstallState = { installed: boolean; ready: boolean; device: DeviceKind; available: boolean; prompt: () => Promise<boolean> }
const InstallContext = createContext<InstallState | null>(null)

export function InstallAppProvider({ children }: { children: ReactNode }) {
  const [installed, setInstalled] = useState(false)
  const [ready, setReady] = useState(false)
  const [device, setDevice] = useState<DeviceKind>('desktop')
  const [available, setAvailable] = useState(false)
  const deferred = useRef<InstallEvent | null>(null)
  useEffect(() => {
    const display = window.matchMedia('(display-mode: standalone)')
    const refresh = () => setInstalled(isInstalledApp())
    const capture = (event: Event) => {
      event.preventDefault()
      deferred.current = event as InstallEvent
      setAvailable(true)
    }
    const completed = () => { deferred.current = null; setAvailable(false); setInstalled(true) }
    setDevice(deviceKind()); refresh(); setReady(true)
    window.addEventListener('beforeinstallprompt', capture)
    window.addEventListener('appinstalled', completed)
    display.addEventListener('change', refresh)
    return () => {
      window.removeEventListener('beforeinstallprompt', capture)
      window.removeEventListener('appinstalled', completed)
      display.removeEventListener('change', refresh)
    }
  }, [])
  async function prompt() {
    const event = deferred.current
    if (!event) return false
    deferred.current = null; setAvailable(false)
    await event.prompt()
    const choice = await event.userChoice
    // Acceptance is not installation confirmation; wait for appinstalled.
    return choice.outcome === 'accepted'
  }
  return <InstallContext.Provider value={{ installed, ready, device, available, prompt }}>{children}</InstallContext.Provider>
}

export function InstallAppCard() {
  const state = useContext(InstallContext)
  const [help, setHelp] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const helpId = useId()
  if (!state?.ready || state.installed) return null
  const { device, available, prompt } = state
  async function install() {
    if (busy) return
    if (!available) { setHelp(value => !value); return }
    setBusy(true); setMessage('')
    try {
      const accepted = await prompt()
      setMessage(accepted ? 'Finish adding UpCatch, then open it from your Home Screen.' : 'You can add UpCatch whenever you are ready.')
    } catch { setHelp(true); setMessage('Use your browser menu to add UpCatch instead.') }
    finally { setBusy(false) }
  }
  return <div className="space-y-3 rounded-2xl bg-muted p-4">
    <p className="font-display font-bold">Keep UpCatch on your Home Screen</p>
    <p className="text-sm text-muted-foreground">{device === 'ios' ? 'On iPhone and iPad, open UpCatch from your Home Screen to enable meetup notifications (iOS 16.4 or later).' : 'Open UpCatch quickly and turn on meetup notifications from your profile.'}</p>
    <PrimaryButton variant="soft" onClick={install} disabled={busy} className="w-full">
      <Download className="size-4" aria-hidden="true" /> {busy ? 'Opening install prompt...' : 'Add to Home Screen'}
    </PrimaryButton>
    {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    {help && <ol id={helpId} className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
      {device === 'ios' ? <>
        <li>Open UpCatch in Safari and tap Share.</li>
        <li>Choose Add to Home Screen, keep Open as Web App on if shown, then tap Add.</li>
      </> : device === 'android' ? <li>In Chrome, open the menu and choose Add to Home screen or Install app. Confirm the option shown.</li> : <li>Use your browser&apos;s install icon or menu. If installation is unavailable, you can keep using UpCatch in this tab.</li>}
      <li>Open UpCatch from its new icon, then enable Meetup notifications in your profile.</li>
    </ol>}
  </div>
}

export function NotificationHelp() {
  return <details className="mt-3 text-sm text-muted-foreground">
    <summary className="cursor-pointer font-semibold text-primary">Not seeing a notification prompt?</summary>
    <p className="mt-2">On iPhone or iPad, add UpCatch to your Home Screen and open it there first. On Android, allow notifications for UpCatch in Chrome&apos;s site settings and allow Chrome notifications in your phone settings. If already installed on iPhone, check Settings → Notifications → UpCatch.</p>
    <p className="mt-2">Return here and turn on Meetup notifications. Installing the app does not turn notifications on automatically.</p>
  </details>
}
