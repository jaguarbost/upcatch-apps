import { Capacitor, registerPlugin } from '@capacitor/core'

type CameraPermission = 'granted' | 'denied' | 'restricted'
const camera = registerPlugin<{
  requestPermission(): Promise<{ status: CameraPermission }>
  openSettings(): Promise<void>
}>('UpCatchCamera')

export function isIosCamera() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
}

export async function requestQrCameraPermission() {
  if (!isIosCamera()) return
  const { status } = await camera.requestPermission()
  if (status !== 'granted') {
    const error = new Error(status === 'restricted'
      ? 'Camera access is restricted on this iPhone. Check Screen Time or device management restrictions.'
      : 'Camera permission is off. Open Settings and enable Camera for UpCatch, then return here.')
    error.name = status === 'restricted' ? 'CameraRestrictedError' : 'NotAllowedError'
    throw error
  }
}

export async function openQrCameraSettings() {
  if (!isIosCamera()) throw new Error('Open your browser settings to allow camera access, then retry.')
  await camera.openSettings()
}
