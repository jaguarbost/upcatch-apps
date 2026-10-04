import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signinPolicy } from '@/lib/server/signin-policy'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { ActionForm, Field } from '@/components/account/form'
import { AccountShell } from '@/components/account/shell'
import { PushSignupChoice } from '@/components/account/push-signup-choice'
import { signUp, signUpWithGoogle } from '../actions'
export default async function SignupPage() {
  if(isSupabaseConfigured()){
    const supabase=await createClient()
    const {data}=await supabase.auth.getClaims()
    if(data?.claims){const policy=await signinPolicy(supabase);redirect(policy.allowed?'/start':'/auth/login?google_required=1')}
  }
  return <AccountShell title="Make room for a real hello" description="Create your account. Confirm your email, add your name and photo, and you're ready.">
    <p className="text-sm text-muted-foreground">Read our <Link href="/privacy" className="font-bold text-primary underline">privacy notice</Link> before creating an account. Analytics and push are optional.</p>
    <PushSignupChoice />
    <ActionForm action={signUpWithGoogle} label="Continue with Google">
      <label className="flex items-start gap-3 text-sm leading-relaxed"><input type="checkbox" name="accept_terms" required className="mt-1 size-4 accent-primary" /><span>I agree to the <Link href="/terms" className="font-bold text-primary underline">Terms of use</Link>, including the public-venue safety guidance.</span></label>
    </ActionForm>
    <p className="text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Or continue with email</p>
    <ActionForm action={signUp} label="Create account">
      <label className="flex items-start gap-3 text-sm leading-relaxed"><input type="checkbox" name="accept_terms" required className="mt-1 size-4 accent-primary" /><span>I agree to the <Link href="/terms" className="font-bold text-primary underline">Terms of use</Link>, including the public-venue safety guidance.</span></label>
      <Field label="Email" name="email" type="email" autoComplete="email" required maxLength={254} />
      <Field label="Password · at least 12 characters" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} />
    </ActionForm>
    <p className="text-sm">Already have an account? <Link href="/auth/login" className="font-bold text-primary">Sign in</Link></p>
  </AccountShell>
}
