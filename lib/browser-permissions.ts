'use client'
import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'

export type DeviceKind = 'ios' | 'android' | 'desktop'
export function deviceKind(): DeviceKind {
  if (typeof navigator === 'undefined') return 'desktop'
  if (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios'
  return /Android/i.test(navigator.userAgent) ? 'android' : 'desktop'
}

export function isInstalledApp() {
  return Capacitor.isNativePlatform() || typeof window !== 'undefined' && (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

// Observe settings changes without triggering a browser permission prompt.
export function observeLocationPermission(onChange: (state: PermissionState | 'unknown') => void) {
  let active = true
  let permission: PermissionStatus | undefined
  let checking = false
  let lastState: PermissionState | 'unknown' | undefined
  const report = (state: PermissionState | 'unknown') => {
    if (!active || state === lastState) return
    lastState = state
    onChange(state)
  }
  const changed = () => { if (permission) report(permission.state) }
  const check = async () => {
    if (!active || checking || document.visibilityState === 'hidden') return
    checking = true
    try {
      if (Capacitor.isNativePlatform()) {
        const status = await Geolocation.checkPermissions()
        report(status.coarseLocation === 'prompt-with-rationale' ? 'prompt' : status.coarseLocation)
        return
      }
      if (!navigator.permissions?.query) { report('unknown'); return }
      const next = await navigator.permissions.query({ name: 'geolocation' })
      if (!active) return
      permission?.removeEventListener('change', changed)
      permission = next
      permission.addEventListener('change', changed)
      changed()
    } catch { report('unknown') }
    finally { checking = false }
  }
  void check()
  window.addEventListener('focus', check)
  document.addEventListener('visibilitychange', check)
  return () => {
    active = false
    permission?.removeEventListener('change', changed)
    window.removeEventListener('focus', check)
    document.removeEventListener('visibilitychange', check)
  }
}
