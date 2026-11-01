import { SecureStorage } from '@aparajita/capacitor-secure-storage'
import { detachPush } from '@/lib/push-client'
import { MobileApi } from './api-client'
import { createNativeAuthClient, type NativeAuthConfig } from './auth-client'
import { NativeAuthFlow } from './auth-flow'
import { NativeSessionManager } from './session-manager'

export type NativeRuntimeConfig = NativeAuthConfig & { apiBaseUrl: string }

export async function createNativeRuntime(config: NativeRuntimeConfig, clearAccountState: () => void | Promise<void>) {
  const supabase = await createNativeAuthClient(config)
  const api = new MobileApi(config.apiBaseUrl, supabase.auth)
  const session = new NativeSessionManager(supabase.auth, api, SecureStorage, detachPush, clearAccountState)
  const authFlow = new NativeAuthFlow(supabase.auth, session, SecureStorage)
  return { supabase, api, session, authFlow }
}
