import { Capacitor } from '@capacitor/core'
import { KeychainAccess, SecureStorage } from '@aparajita/capacitor-secure-storage'
import { createClient } from '@supabase/supabase-js'
import { ACTIVE_MEMBER_KEY, INSTALL_MARKER_KEY, NATIVE_SESSION_KEY } from './storage-keys'

const STORAGE_PREFIX = 'upcatch_auth_'

export type NativeAuthConfig = {
  supabaseUrl: string
  publishableKey: string
}

// Create this client only inside the installed app. The plugin's web fallback
// uses plaintext localStorage and must never hold a production refresh token.
export async function createNativeAuthClient(
  { supabaseUrl, publishableKey }: NativeAuthConfig,
  installMarker?: Pick<Storage, 'getItem' | 'setItem'>,
) {
  if (!Capacitor.isNativePlatform()) throw new Error('Native authentication requires the installed app.')
  const url = new URL(supabaseUrl)
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || !publishableKey)
    throw new Error('A public HTTPS Supabase configuration is required.')

  await SecureStorage.setKeyPrefix(STORAGE_PREFIX)
  await SecureStorage.setSynchronize(false)
  await SecureStorage.setDefaultKeychainAccess(KeychainAccess.whenUnlockedThisDeviceOnly)

  // iOS Keychain entries can survive uninstall. Android's app-scoped secure
  // storage is removed on uninstall, so WebView storage must not erase a valid
  // Android session when the local origin or its data changes.
  if (Capacitor.getPlatform() === 'ios') {
    const marker = installMarker ?? globalThis.localStorage
    if (marker.getItem(INSTALL_MARKER_KEY) !== 'installed') {
      await SecureStorage.removeItem(NATIVE_SESSION_KEY)
      await SecureStorage.removeItem(ACTIVE_MEMBER_KEY)
      marker.setItem(INSTALL_MARKER_KEY, 'installed')
    }
  }

  return createClient(url.origin, publishableKey, {
    auth: {
      storageKey: NATIVE_SESSION_KEY,
      storage: {
        getItem: key => SecureStorage.getItem(key),
        setItem: (key, value) => SecureStorage.setItem(key, value),
        removeItem: key => SecureStorage.removeItem(key),
      },
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  })
}
