import { Capacitor, registerPlugin } from '@capacitor/core'

const settings = registerPlugin<{
  openAppSettings(): Promise<void>
  openLocationSettings(): Promise<void>
}>('UpCatchSettings')
const iosSettings = registerPlugin<{ openSettings(): Promise<void> }>('UpCatchCamera')

export async function openLocationSettings(appPermission = false) {
  if (!Capacitor.isNativePlatform()) throw new Error('Open your phone Settings to allow location.')
  if (Capacitor.getPlatform() === 'ios') return iosSettings.openSettings()
  if (Capacitor.getPlatform() !== 'android') throw new Error('Open your phone Settings to allow location.')
  if (appPermission) await settings.openAppSettings()
  else await settings.openLocationSettings()
}
