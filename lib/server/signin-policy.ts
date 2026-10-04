import 'server-only'
import { adminClient } from '@/lib/supabase/admin'
import type { createClient } from '@/lib/supabase/server'

export async function emailUsesGoogle(email: string): Promise<boolean> {
  const { data, error } = await adminClient().rpc('email_uses_google', { p_email: email })
  if (error) throw new Error('Sign-in settings are temporarily unavailable.')
  return data === true
}
export async function signinPolicy(supabase: Awaited<ReturnType<typeof createClient>>): Promise<{allowed:boolean;google_required:boolean}> {
  const { data, error } = await supabase.rpc('my_signin_policy')
  if (error || !data) throw new Error('Sign-in settings are temporarily unavailable.')
  return data
}
