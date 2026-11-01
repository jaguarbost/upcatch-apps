export function LocationHelp({ denied = false }: { denied?: boolean }) {
  return <div className="space-y-2 rounded-2xl bg-muted p-4 text-sm text-muted-foreground" role="status">
    <p className="font-semibold text-foreground">{denied ? 'Allow location in your settings' : 'Check location access'}</p>
    <p>{denied ? 'UpCatch has been blocked from using your location. It may not show another prompt until you change this.' : 'Make sure location services are on and UpCatch has permission to use them.'}</p>
    <ol className="list-decimal space-y-2 pl-5">
      <li>Open your phone Settings, find UpCatch and allow location while using the app.</li>
      <li>Turn on location services on your phone, then return to UpCatch and tap Try location again.</li>
    </ol>
  </div>
}
