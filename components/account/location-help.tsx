'use client'

import { useEffect, useState } from 'react'
import { deviceKind, type DeviceKind } from '@/lib/browser-permissions'

export function LocationHelp({ denied = false }: { denied?: boolean }) {
  const [device, setDevice] = useState<DeviceKind>('desktop')
  useEffect(() => setDevice(deviceKind()), [])
  return <div className="space-y-2 rounded-2xl bg-muted p-4 text-sm text-muted-foreground" role="status">
    <p className="font-semibold text-foreground">{denied ? 'Allow location in your settings' : 'Check location access'}</p>
    <p>{denied ? 'Your browser or phone has blocked location. It may not show another permission prompt until you change this.' : 'Make sure location services are on and your browser has permission to use them.'}</p>
    <ol className="list-decimal space-y-2 pl-5">
      {device === 'android' ? <>
        <li>In Chrome, open the menu, then Settings → Site settings → Location. Allow sites to ask and allow UpCatch if it is blocked.</li>
        <li>In your phone Settings, turn on Location. Under Apps → Chrome → Permissions → Location, allow access while using the app.</li>
      </> : device === 'ios' ? <>
        <li>In iPhone or iPad Settings → Privacy &amp; Security → Location Services, turn location on and allow your browser to use it while open.</li>
        <li>In Safari, open the page menu → Website Settings → Location and choose Ask or Allow. If using Chrome, also check Chrome&apos;s location permission in phone Settings.</li>
      </> : <>
        <li>Open the site controls next to the address bar and allow Location for UpCatch.</li>
        <li>Check that location services are enabled for your browser in your device settings.</li>
      </>}
      <li>Return to UpCatch and tap Try location again. You can keep this page open.</li>
    </ol>
  </div>
}
