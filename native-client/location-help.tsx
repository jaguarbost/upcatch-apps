import { useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { openLocationSettings } from '@/lib/native/location-settings'

export function LocationHelp({ denied = false }: { denied?: boolean }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function open(appPermission: boolean) {
    setBusy(true); setError('')
    try { await openLocationSettings(appPermission) }
    catch { setError('Open phone Settings manually, then allow location for UpCatch.') }
    finally { setBusy(false) }
  }
  return <div className="space-y-2 rounded-2xl bg-muted p-4 text-sm text-muted-foreground" role="status">
    <p className="font-semibold text-foreground">{denied ? 'Allow location in your settings' : 'Check location access'}</p>
    <p>{denied ? 'UpCatch has been blocked from using your location. It may not show another prompt until you change this.' : 'Make sure location services are on and UpCatch has permission to use them.'}</p>
    <ol className="list-decimal space-y-2 pl-5">
      <li>Open your phone Settings, find UpCatch and allow location while using the app.</li>
      <li>Turn on location services on your phone, then return to UpCatch and tap Try location again.</li>
    </ol>
    <button type="button" disabled={busy} onClick={() => void open(true)} className="press min-h-11 w-full rounded-xl bg-primary px-3 font-bold text-primary-foreground disabled:opacity-50">Open app settings</button>
    {Capacitor.getPlatform() === 'android' && <button type="button" disabled={busy} onClick={() => void open(false)} className="press min-h-11 w-full rounded-xl border border-border px-3 font-bold text-primary disabled:opacity-50">Open location settings</button>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
  </div>
}
