import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { supabaseConfig } from '@/lib/supabase/config'

export class NativeAuthError extends Error {
  constructor(public readonly status: 401 | 403 | 503, message: string) {
    super(message)
  }
}

// Native endpoints require a Supabase access token. They never fall back to a
// browser cookie or trust a member ID supplied in a request body or header.
export async function requireNativeMember(request: Request) {
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(request.headers.get('authorization') ?? '')
  const token = match?.[1]
  if (!token || token.length > 8192) throw new NativeAuthError(401, 'Sign in to continue.')

  const { url, key } = supabaseConfig()
  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>['data']['user']
  try {
    const { data, error } = await supabase.auth.getUser(token)
    if (error) {
      if (error.name === 'AuthRetryableFetchError' || (error.status ?? 0) >= 500) {
        throw new NativeAuthError(503, 'Sign-in is temporarily unavailable.')
      }
      throw new NativeAuthError(401, 'Sign in to continue.')
    }
    user = data.user
  } catch (error) {
    if (error instanceof NativeAuthError) throw error
    throw new NativeAuthError(503, 'Sign-in is temporarily unavailable.')
  }
  if (!user) throw new NativeAuthError(401, 'Sign in to continue.')
  if (!user.email_confirmed_at) throw new NativeAuthError(403, 'Confirm your email to continue.')

  const { data: policy, error: policyError } = await supabase.rpc('my_signin_policy')
  if (policyError || !policy) throw new NativeAuthError(503, 'Sign-in settings are temporarily unavailable.')
  if (!policy.allowed) throw new NativeAuthError(403, 'This sign-in method is not available for your account.')

  const { data: profile, error: profileError } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
  if (profileError) throw new NativeAuthError(503, 'Profile is temporarily unavailable.')
  if (!profile) throw new NativeAuthError(403, 'Your profile is not available.')
  return { supabase, user, profile }
}
