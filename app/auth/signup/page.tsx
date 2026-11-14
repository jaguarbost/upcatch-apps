import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signinPolicy } from '@/lib/server/signin-policy'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { AccountShell } from '@/components/account/shell'
import { SignupForms } from '@/components/account/signup-forms'
export default async function SignupPage() {
  if(isSupabaseConfigured()){
    const supabase=await createClient()
    const {data}=await supabase.auth.getClaims()
    if(data?.claims){const policy=await signinPolicy(supabase);redirect(policy.allowed?'/start':'/auth/login?google_required=1')}
  }
  return <AccountShell title="Make room for a real hello" description="Create your account. Confirm your email, add your name and photo, and you're ready.">
    <p className="text-sm text-muted-foreground">Read our <Link href="/privacy" className="font-bold text-primary underline">privacy notice</Link> before creating an account. Analytics and push are optional.</p>
    <SignupForms />
    <p className="text-sm">Already have an account? <Link href="/auth/login" className="font-bold text-primary">Sign in</Link></p>
  </AccountShell>
}
