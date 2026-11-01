import type { ReactNode } from 'react'

export function InstallAppProvider({ children }: { children: ReactNode }) { return <>{children}</> }
export function InstallAppCard() { return null }
export function NotificationHelp() {
  return <details className="mt-3 text-sm text-muted-foreground">
    <summary className="cursor-pointer font-semibold text-primary">Not seeing a notification prompt?</summary>
    <p className="mt-2">Allow UpCatch notifications in your phone Settings, then return here and turn on Meetup notifications.</p>
    <p className="mt-2">Installing the app does not turn notifications on automatically.</p>
  </details>
}
