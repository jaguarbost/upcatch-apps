'use client'
import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'
import { createClient } from '@/lib/supabase/client'

export class LocationError extends Error {
  constructor(message: string, public readonly status: 'denied' | 'unavailable' = 'unavailable') {
    super(message)
  }
}

export async function saveBrowserLocation(): Promise<[number, number]> {
  const position = Capacitor.isNativePlatform() ? await (async () => {
    try {
      const permission = await Geolocation.requestPermissions({ permissions: ['coarseLocation'] })
      if (permission.coarseLocation !== 'granted') throw new LocationError('Location is blocked. Allow UpCatch in your device settings, then try again.', 'denied')
      return await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 })
    } catch (error) {
      if (error instanceof LocationError) throw error
      throw new LocationError('Your location is unavailable. Turn on your device’s location services and retry.')
    }
  })() : await new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new LocationError('Location is unavailable in this browser. Try another browser to continue.'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, error => {
      reject(new LocationError(error.code === 1
        ? 'Location is blocked. Allow it in your browser’s site settings, then try again.'
        : error.code === 3 ? 'Finding your location took too long. Please try again.'
        : 'Your location is unavailable. Turn on your device’s location services and retry.', error.code === 1 ? 'denied' : 'unavailable'))
    }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 })
  })
  const { latitude, longitude } = position.coords
  const { error } = await createClient().rpc('save_member_settings', {
    p_patch: { latitude: Math.round(latitude * 100) / 100, longitude: Math.round(longitude * 100) / 100 },
  })
  if (error) throw new LocationError('Your location was found but could not be saved. Please retry.')
  return [latitude, longitude]
}
