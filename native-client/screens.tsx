import { useEffect, useState, type FormEvent } from 'react'
import { AccountShell } from '@/components/account/shell'
import { Field } from '@/components/account/form'
import { PrimaryButton } from '@/components/upcatch/primitives'
import type { createNativeRuntime } from '@/lib/native/runtime'
import type { NativeAuthReturn } from '@/lib/native/return-links'
import { Browser } from '@capacitor/browser'
import { createClient } from './supabase-client'
import { nativePublicConfig } from './config'
import './login-background.css'

type Runtime = Awaited<ReturnType<typeof createNativeRuntime>>
type Navigate = (path: string) => void
type Ready = () => Promise<void>

function ErrorLine({ message }: { message: string }) {
  return message ? <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{message}</p> : null
}

function useFormAction(action: (form: FormData) => Promise<void>) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [complete, setComplete] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError(''); setComplete(false)
    try { await action(new FormData(event.currentTarget)); setComplete(true) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Please try again.') }
    finally { setBusy(false) }
  }
  return { busy, error, complete, submit }
}

export function LoginScreen({ runtime, navigate, ready, notice }: { runtime: Runtime; navigate: Navigate; ready: Ready; notice: string }) {
  const form = useFormAction(async data => {
    await runtime.session.signInWithPassword(String(data.get('email') || ''), String(data.get('password') || ''))
    await ready()
  })
  const [googleError, setGoogleError] = useState('')
  return <div className="native-login-background"><AccountShell title="Good to see you" description="Sign in to your UpCatch account.">
    {notice && <p role="status" className="rounded-xl bg-primary/10 p-3 text-sm">{notice}</p>}
    <ErrorLine message={googleError} />
    <div className="native-login-controls space-y-6">
    <PrimaryButton onClick={() => { void runtime.authFlow.startGoogle(false).catch(error => setGoogleError(error instanceof Error ? error.message : 'Google sign-in failed.')) }} className="w-full">Continue with Google</PrimaryButton>
    <p className="text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Or continue with email</p>
    <form onSubmit={form.submit} className="space-y-5">
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required />
      <ErrorLine message={form.error} />
      <PrimaryButton type="submit" disabled={form.busy} className="w-full">{form.busy ? 'Please wait…' : 'Sign in'}</PrimaryButton>
    </form>
    </div>
    <div className="flex justify-between text-sm"><button className="font-bold text-primary" onClick={() => navigate('/auth/signup')}>Create an account</button><button onClick={() => navigate('/auth/forgot-password')}>Forgot password?</button></div>
    <button className="block text-sm text-muted-foreground" onClick={() => navigate('/auth/check-email')}>Need another confirmation email?</button>
  </AccountShell></div>
}

export function SignUpScreen({ runtime, navigate }: { runtime: Runtime; navigate: Navigate }) {
  const [accepted, setAccepted] = useState(false)
  const form = useFormAction(async data => {
    await runtime.authFlow.signUp(String(data.get('email') || ''), String(data.get('password') || ''), data.get('accept_terms') === 'on')
    navigate('/auth/check-email')
  })
  const [googleError, setGoogleError] = useState('')
  return <AccountShell title="Join UpCatch" description="Create an account to meet new friends in Manchester.">
    <ErrorLine message={googleError} />
    <PrimaryButton onClick={() => { if (!accepted) { setGoogleError('Please accept the Terms of use to create an account.'); return } void runtime.authFlow.startGoogle(true).catch(error => setGoogleError(error instanceof Error ? error.message : 'Google sign-in failed.')) }} className="w-full">Continue with Google</PrimaryButton>
    <p className="text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Or continue with email</p>
    <form onSubmit={form.submit} className="space-y-5">
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      <Field label="Password" name="password" type="password" autoComplete="new-password" minLength={12} required />
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="accept_terms" checked={accepted} onChange={event => setAccepted(event.target.checked)} required className="mt-1" /><span>I accept the Terms of use and privacy notice.</span></label>
      <ErrorLine message={form.error} />
      <PrimaryButton type="submit" disabled={form.busy} className="w-full">{form.busy ? 'Please wait…' : 'Create account'}</PrimaryButton>
    </form>
    <button className="text-sm font-bold text-primary" onClick={() => navigate('/auth/login')}>Already a member? Sign in</button>
  </AccountShell>
}

export function CheckEmailScreen({ runtime, navigate, reset = false }: { runtime: Runtime; navigate: Navigate; reset?: boolean }) {
  const form = useFormAction(async data => {
    const email = String(data.get('email') || '')
    if (reset) await runtime.authFlow.requestPasswordReset(email)
    else await runtime.authFlow.resendConfirmation(email)
  })
  return <AccountShell title="Check your email" description={reset ? 'Use the recovery link sent to your email, then return to UpCatch.' : 'Use the confirmation link sent to your email, then return to UpCatch.'}>
    <form onSubmit={form.submit} className="space-y-5">
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      <ErrorLine message={form.error} />
      {form.complete && <p role="status" className="rounded-xl bg-primary/10 p-3 text-sm">If this address is eligible, a link is on its way.</p>}
      <PrimaryButton type="submit" disabled={form.busy} className="w-full">{reset ? 'Resend recovery link' : 'Resend confirmation'}</PrimaryButton>
    </form>
    <button className="text-sm font-bold text-primary" onClick={() => navigate('/auth/login')}>Back to sign in</button>
  </AccountShell>
}

export function ForgotScreen({ runtime, navigate }: { runtime: Runtime; navigate: Navigate }) {
  const form = useFormAction(async data => { await runtime.authFlow.requestPasswordReset(String(data.get('email') || '')); navigate('/auth/check-email?reset=1') })
  return <AccountShell title="Reset your password" description="We'll email a recovery link if this address has a password account.">
    <form onSubmit={form.submit} className="space-y-5">
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      <ErrorLine message={form.error} />
      <PrimaryButton type="submit" disabled={form.busy} className="w-full">Send reset link</PrimaryButton>
    </form>
    <button className="text-sm font-bold text-primary" onClick={() => navigate('/auth/login')}>Back to sign in</button>
  </AccountShell>
}

export function ConfirmScreen({ runtime, pending, ready, navigate }: { runtime: Runtime; pending: Extract<NativeAuthReturn, { kind: 'confirmation' }> | null; ready: Ready; navigate: Navigate }) {
  const form = useFormAction(async () => {
    if (!pending) throw new Error('Open a fresh confirmation link from your email.')
    const result = await runtime.authFlow.confirmEmail(pending, true)
    if (result.path === '/auth/reset-password') navigate(result.path)
    else await ready()
  })
  return <AccountShell title="Confirm your email" description="Press confirm to finish this email link.">
    <form onSubmit={form.submit} className="space-y-5">
      <ErrorLine message={form.error} />
      <PrimaryButton type="submit" disabled={form.busy || !pending} className="w-full">Confirm email</PrimaryButton>
    </form>
  </AccountShell>
}

export function ResetScreen({ ready }: { ready: Ready }) {
  const form = useFormAction(async data => {
    const password = String(data.get('password') || '')
    if (password.length < 12 || password.length > 128) throw new Error('Use a password of 12 to 128 characters.')
    const client = createClient()
    const { data: policy, error: policyError } = await client.rpc('my_signin_policy')
    if (policyError || !policy) throw new Error('Sign-in settings are temporarily unavailable. Please retry.')
    if (policy.google_required) throw new Error('This account uses Google. Sign in with Google instead of setting a password.')
    const { error } = await client.auth.updateUser({ password })
    if (error) throw new Error('Password could not be updated. Request a fresh reset link.')
    await ready()
  })
  return <AccountShell title="Choose a new password" description="Use a strong password for your UpCatch account.">
    <form onSubmit={form.submit} className="space-y-5">
      <Field label="New password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
      <ErrorLine message={form.error} />
      <PrimaryButton type="submit" disabled={form.busy} className="w-full">Save password</PrimaryButton>
    </form>
  </AccountShell>
}

export function AcceptTermsScreen({ runtime, ready }: { runtime: Runtime; ready: Ready }) {
  const form = useFormAction(async data => { await runtime.authFlow.acceptTerms(data.get('accept_terms') === 'on'); await ready() })
  return <AccountShell title="One more thing" description="Accept the Terms of use to continue with your UpCatch account.">
    <form onSubmit={form.submit} className="space-y-5">
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="accept_terms" required className="mt-1" /><span>I accept the Terms of use and privacy notice.</span></label>
      <ErrorLine message={form.error} />
      <PrimaryButton type="submit" disabled={form.busy} className="w-full">Continue</PrimaryButton>
    </form>
  </AccountShell>
}

export function PrivacyScreen({ path }: { path: '/privacy' | '/terms' }) {
  const isPrivacy = path === '/privacy'
  return <AccountShell title={isPrivacy ? 'Your privacy at UpCatch' : 'Terms of use'} description={isPrivacy ? 'Read how UpCatch handles your data.' : 'Read the terms for using UpCatch.'}>
    <PrimaryButton onClick={() => { void Browser.open({ url: `${nativePublicConfig.apiBaseUrl}${path}` }) }} className="w-full">Read full {isPrivacy ? 'privacy notice' : 'terms'}</PrimaryButton>
  </AccountShell>
}

export function PrivacyRequestsScreen() {
  const [requests, setRequests] = useState<{ id: string; kind: string; status: string; created_at: string }[]>([])
  const [loadError, setLoadError] = useState('')
  const refresh = async () => {
    const { data, error } = await createClient().rpc('my_privacy_requests')
    if (error) setLoadError('Request history is temporarily unavailable.')
    else { setLoadError(''); setRequests(data ?? []) }
  }
  useEffect(() => { void refresh() }, [])
  const form = useFormAction(async data => {
    const { error } = await createClient().rpc('request_privacy_right', { p_kind: String(data.get('kind') || '') })
    if (error) throw new Error('Your request could not be saved. Please try again.')
    await refresh()
  })
  return <AccountShell title="Your data rights" description="Requests are reviewed by the UpCatch operator.">
    <form onSubmit={form.submit} className="space-y-5">
      <label className="block space-y-2 text-sm font-semibold"><span>Request type</span><select name="kind" required className="w-full rounded-xl border border-border bg-background px-4 py-3">{['access','portability','correction','erasure','restriction','objection'].map(kind => <option key={kind} value={kind}>{kind}</option>)}</select></label>
      <ErrorLine message={form.error} />
      <PrimaryButton type="submit" disabled={form.busy} className="w-full">Submit request</PrimaryButton>
    </form>
    <p className="text-sm text-muted-foreground">We will contact you using your account email to confirm details. You can submit one open request of each type.</p>
    <ErrorLine message={loadError} />
    <ul className="space-y-2">{requests.map(request => <li key={request.id} className="rounded-xl bg-card p-3 text-sm">{request.kind} · {request.status} · {new Date(request.created_at).toLocaleDateString('en-GB')}</li>)}</ul>
  </AccountShell>
}
