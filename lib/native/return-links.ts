import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import type { SupabaseClient } from '@supabase/supabase-js'

export const NATIVE_AUTH_CALLBACK = 'uk.co.upcatch.app://auth/callback'

export type NativeAuthReturn =
  | { kind: 'code'; code: string; destination: '/start' | '/auth/reset-password' }
  | { kind: 'confirmation'; tokenHash: string; type: 'signup' | 'recovery' | 'email_change' }
  | { kind: 'error' }

export function parseNativeAuthReturn(raw: string): NativeAuthReturn | null {
  let url: URL
  try { url = new URL(raw) } catch { return null }
  if (url.protocol !== 'uk.co.upcatch.app:' || url.hostname !== 'auth' || url.pathname !== '/callback' || url.username || url.password) return null
  const params = url.searchParams
  if (params.has('error') || url.hash.includes('error=')) return { kind: 'error' }
  const code = params.get('code')
  const tokenHash = params.get('token_hash')
  if (code && !tokenHash && /^[A-Za-z0-9_-]{8,512}$/.test(code)) {
    return { kind: 'code', code, destination: params.get('next') === 'reset' ? '/auth/reset-password' : '/start' }
  }
  const type = params.get('type')
  if (tokenHash && !code && ['signup', 'recovery', 'email_change'].includes(type ?? '') && /^[A-Za-z0-9_-]{16,256}$/.test(tokenHash)) {
    return { kind: 'confirmation', tokenHash, type: type as 'signup' | 'recovery' | 'email_change' }
  }
  return null
}

// Register before reading the launch URL: iOS/Android may deliver the same link both ways.
export async function listenForNativeAuthReturns(
  onReturn: (result: NativeAuthReturn) => void | Promise<void>,
  onError: (error: unknown) => void = () => undefined,
) {
  let lastUrl = ''
  const receive = async (raw: string) => {
    const result = parseNativeAuthReturn(raw)
    if (!result || raw === lastUrl) return
    lastUrl = raw
    await onReturn(result)
  }
  const listener = await App.addListener('appUrlOpen', event => { void receive(event.url).catch(onError) })
  const launch = await App.getLaunchUrl()
  if (launch?.url) await receive(launch.url)
  return () => listener.remove()
}

export async function openNativeAuthBrowser(url: string) {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Authentication requires HTTPS.')
  await Browser.open({ url: parsed.toString(), presentationStyle: 'fullscreen' })
}

export async function exchangeNativeAuthCode(auth: SupabaseClient['auth'], result: Extract<NativeAuthReturn, { kind: 'code' }>) {
  const { error } = await auth.exchangeCodeForSession(result.code)
  if (error) throw new Error('This sign-in link has expired. Please try again.')
  return result.destination
}

// Call only after the member presses the confirmation button in the native flow.
export async function confirmNativeEmail(auth: SupabaseClient['auth'], result: Extract<NativeAuthReturn, { kind: 'confirmation' }>) {
  const { error } = await auth.verifyOtp({ token_hash: result.tokenHash, type: result.type })
  if (error) throw new Error('This link has expired or has already been used. Request a new email.')
  return result.type === 'recovery' ? '/auth/reset-password' : '/start'
}
