import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signinPolicy } from '@/lib/server/signin-policy'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { ActionForm, Field } from '@/components/account/form'
import { AccountShell } from '@/components/account/shell'
import { signIn, signInWithGoogle } from '../actions'
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ confirmed?: string; oauth_error?: string; google_required?:string }> }) {
  let googleRequired=false
  if(isSupabaseConfigured()){
    const supabase=await createClient()
    const {data,error}=await supabase.auth.getClaims()
    if(error && (error.name==='AuthRetryableFetchError' || (error.status??0)>=500))throw new Error('Sign-in is temporarily unavailable. Please try again shortly.')
    if(data?.claims){const policy=await signinPolicy(supabase);if(policy.allowed)redirect('/start');googleRequired=policy.google_required}
  }
  const { confirmed, oauth_error, google_required } = await searchParams
  return <AccountShell title="Good to see you" description="Sign in to your UpCatch account.">
    {(googleRequired||google_required) && <p role="status" className="rounded-xl bg-primary/10 p-3 text-sm">Your account uses Google. Continue with Google to access your existing profile.</p>}
    {oauth_error && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">Sign-in was not completed. Please try again.</p>}
    {confirmed && <p role="status" className="rounded-2xl bg-secondary p-3 text-sm leading-relaxed text-secondary-foreground">
      Your email is confirmed. Sign in to continue.</p>}
    <ActionForm action={signInWithGoogle} label="Continue with Google" />
    <p className="text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Or continue with email</p>
    <ActionForm action={signIn} label="Sign in">
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required />
    </ActionForm>
    <div className="flex justify-between text-sm"><Link href="/auth/signup" className="font-bold text-primary">Create an account</Link>
      <Link href="/auth/forgot-password">Forgot password?</Link></div>
    <Link href="/auth/check-email" className="block text-sm text-muted-foreground">Need another confirmation email?</Link>
  </AccountShell>
}
