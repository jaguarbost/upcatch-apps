'use server'
import { cookies } from 'next/headers'
import { emailUsesGoogle, signinPolicy } from '@/lib/server/signin-policy'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { authCallbackUrl } from '@/lib/server/member'
import { emailValue, passwordValue, type FormState } from '@/lib/forms'

export async function signUp(_: FormState, form: FormData): Promise<FormState> {
  if(form.get('accept_terms')!=='on') return {error:'Please accept the Terms of use to create an account.'}
  try {
    const supabase = await createClient()
    if(await emailUsesGoogle(emailValue(form))) return { message: 'If you already joined with Google, continue with Google to use your existing account.' }
    const { data, error } = await supabase.auth.signUp({
      email: emailValue(form), password: passwordValue(form),
      options: { emailRedirectTo: authCallbackUrl(), data: { terms_version: '2026-09-29', terms_accepted_at: new Date().toISOString() } },
    })
    if (error) {
      if (error.status === 429) return { error: 'Too many attempts. Please wait a minute and try again.' }
      if (error.code === 'weak_password') return { error: 'Choose a stronger password.' }
      return { error: 'Signup could not be completed. Check your details or try again shortly.' }
    }
    // Only sign out a real auto-session; an unconditional sign-out also deletes the PKCE verifier the email link needs.
    if (data.session) await supabase.auth.signOut()
  } catch (error) { return { error: error instanceof Error ? error.message : 'Signup failed.' } }
  redirect('/auth/check-email')
}
export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailValue(form), password: String(form.get('password') ?? ''),
    })
    if (error) return { error: 'Unable to sign in. Check your details, or use Continue with Google if you joined with Google.' }
    const policy=await signinPolicy(supabase)
    if(policy.google_required){
      await supabase.auth.signOut({scope:'local'})
      return {error:'This account uses Google. Choose Continue with Google to sign in.'}
    }
    if (!data.user.email_confirmed_at) {
      await supabase.auth.signOut()
      return { error: 'Confirm your email before signing in.' }
    }
  } catch { return { error: 'Sign-in is temporarily unavailable.' } }
  redirect('/start')
}
export async function resendConfirmation(_: FormState, form: FormData): Promise<FormState> {
  try {
    const supabase = await createClient()
    await supabase.auth.resend({ type: 'signup', email: emailValue(form),
      options: { emailRedirectTo: authCallbackUrl() } })
    return { message: 'If your account needs confirmation, a link will arrive shortly. Please wait a minute before requesting another.' }
  } catch { return { error: 'Enter a valid email and try again shortly.' } }
}
export async function requestReset(_: FormState, form: FormData): Promise<FormState> {
  try {
    const supabase = await createClient()
    const email=emailValue(form)
    if(!await emailUsesGoogle(email)) await supabase.auth.resetPasswordForEmail(email, { redirectTo: authCallbackUrl('reset') })
    return { message: 'If this email has a password account, a reset link will arrive shortly. Google accounts should use Continue with Google.' }
  } catch { return { error: 'Recovery is temporarily unavailable. Please try again.' } }
}
export async function confirmEmail(_: FormState, form: FormData): Promise<FormState> {
  const cookieStore=await cookies()
  let type='', token_hash=''
  try {const pending=JSON.parse(cookieStore.get('upcatch-confirmation')?.value??'{}');type=pending.type??'';token_hash=pending.token??''}catch{}
  cookieStore.set('upcatch-confirmation','',{path:'/auth',maxAge:0})
  if (!['signup','recovery','email_change'].includes(type) || !token_hash || token_hash.length > 256) {
    return { error: 'This confirmation link is invalid. Request a new email.' }
  }
  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({
    token_hash, type: type as 'signup' | 'recovery' | 'email_change',
  })
  if (error) return { error: 'This link has expired or has already been used. Request a new email.' }
  redirect(type === 'recovery' ? '/auth/reset-password' : '/start')
}
export async function resetPassword(_: FormState, form: FormData): Promise<FormState> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Open the password reset link from your email first.' }
    const policy=await signinPolicy(supabase)
    if(policy.google_required)return {error:'This account uses Google. Sign in with Google instead of setting a password.'}
    const { error } = await supabase.auth.updateUser({ password: passwordValue(form) })
    if (error) return { error: 'Password could not be updated. Request a fresh reset link.' }
  } catch(error) { return { error: error instanceof Error ? error.message : 'Password update failed.' } }
  redirect('/start')
}
export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/auth/login')
}

export async function signUpWithGoogle(state: FormState, form: FormData): Promise<FormState> {
  if(form.get('accept_terms')!=='on') return {error:'Please accept the Terms of use to create an account.'}
  const cookieStore=await cookies()
  cookieStore.set('upcatch-terms-accepted',new Date().toISOString(),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/auth',maxAge:600})
  return signInWithGoogle(state)
}

export async function acceptTerms(_: FormState, form: FormData): Promise<FormState> {
  if(form.get('accept_terms')!=='on') return {error:'Please accept the Terms of use to continue.'}
  const supabase=await createClient()
  const {data}=await supabase.auth.getUser()
  if(!data.user) return {error:'Your sign-in has expired. Please sign in again.'}
  const {error}=await supabase.auth.updateUser({data:{terms_version:'2026-09-29',terms_accepted_at:new Date().toISOString()}})
  if(error) return {error:'Could not save your acceptance. Please retry.'}
  redirect('/start')
}

export async function signInWithGoogle(_: FormState): Promise<FormState> {
  let destination: string | undefined
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google', options: { redirectTo: authCallbackUrl(), skipBrowserRedirect: true },
    })
    if (error || !data.url) return { error: 'Google sign-in is unavailable. Please try again shortly.' }
    destination = data.url
  } catch { return { error: 'Google sign-in is temporarily unavailable.' } }
  redirect(destination)
}
