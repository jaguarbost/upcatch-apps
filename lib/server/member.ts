import 'server-only'
import { signinPolicy } from './signin-policy'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/config'
export async function requireMember() {
  if (!isSupabaseConfigured()) redirect('/start')
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if(error && (error.name==='AuthRetryableFetchError' || (error.status??0)>=500))throw new Error('Sign-in is temporarily unavailable. Please try again shortly.')
  if (error || !user) redirect('/auth/login')
  if (!user.email_confirmed_at) redirect('/auth/check-email')
  const policy = await signinPolicy(supabase)
  if (!policy.allowed) redirect('/auth/login?google_required=1')
  const { data: profile, error: profileError } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
  if (profileError) throw new Error('Profile unavailable. Check the database migrations and try again.')
  if (!profile) throw new Error('Your profile is not available. Contact support.')
  return { supabase, user, profile }
}
function deploymentUrl() {
  if (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL
  }
  return process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : undefined
}
export function siteUrl() {
  if (process.env.VERCEL_ENV === 'production') return 'https://www.upcatch.co.uk'
  const value = process.env.NEXT_PUBLIC_SITE_URL || deploymentUrl()
  if (!value) throw new Error('Site URL is not configured.')
  const url = new URL(value)
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new Error('Site URL must use HTTPS.')
  return url.origin
}
// The v0 preview proxy URL routes Supabase email links back to this app's /auth/callback.
export function authCallbackUrl(next?: 'reset') {
  const base = (process.env.VERCEL_ENV !== 'production' && process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL) || siteUrl() + '/auth/callback'
  if (!next) return base
  return base + (base.includes('?') ? '&' : '?') + 'next=' + next
}
