import type { SupabaseClient } from '@supabase/supabase-js'
import type { NativeSessionManager } from './session-manager'
import {
  NATIVE_AUTH_CALLBACK,
  confirmNativeEmail,
  exchangeNativeAuthCode,
  listenForNativeAuthReturns,
  openNativeAuthBrowser,
  type NativeAuthReturn,
} from './return-links'

const TERMS_VERSION = '2026-09-29'
const GOOGLE_TERMS_KEY = 'pending-google-terms-v1'
type SecureStore = {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}

// The packaged UI owns the screens; this class owns native Auth redirects.
export class NativeAuthFlow {
  constructor(
    private readonly auth: SupabaseClient['auth'],
    private readonly session: NativeSessionManager,
    private readonly store: SecureStore,
  ) {}

  listen(onReturn: (result: NativeAuthReturn) => void | Promise<void>, onError: (error: unknown) => void) {
    return listenForNativeAuthReturns(onReturn, onError)
  }

  async signUp(email: string, password: string, acceptedTerms: boolean) {
    if (!acceptedTerms) throw new Error('Please accept the Terms of use to create an account.')
    if (this.session.current()) await this.session.signOut()
    const { data, error } = await this.auth.signUp({
      email, password,
      options: { emailRedirectTo: NATIVE_AUTH_CALLBACK,
        data: { terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString() } },
    })
    if (error) throw error
    if (data.session) await this.auth.signOut({ scope: 'local' })
    return { kind: 'check-email' } as const
  }

  async resendConfirmation(email: string) {
    const { error } = await this.auth.resend({ type: 'signup', email, options: { emailRedirectTo: NATIVE_AUTH_CALLBACK } })
    if (error) throw new Error('Confirmation is temporarily unavailable. Please try again shortly.')
    return { kind: 'check-email' } as const
  }

  async requestPasswordReset(email: string) {
    const { error } = await this.auth.resetPasswordForEmail(email, { redirectTo: `${NATIVE_AUTH_CALLBACK}?next=reset` })
    if (error) throw error
    return { kind: 'check-email' } as const
  }

  async startGoogle(acceptedTerms: boolean) {
    if (this.session.current()) await this.session.signOut()
    // Persist the user's explicit choice across a cold OAuth return.
    if (acceptedTerms) await this.store.setItem(GOOGLE_TERMS_KEY, new Date().toISOString())
    else await this.store.removeItem(GOOGLE_TERMS_KEY)
    const { data, error } = await this.auth.signInWithOAuth({
      provider: 'google', options: { redirectTo: NATIVE_AUTH_CALLBACK, skipBrowserRedirect: true },
    })
    if (error || !data.url) {
      await this.store.removeItem(GOOGLE_TERMS_KEY)
      throw new Error('Google sign-in is unavailable. Please try again shortly.')
    }
    await openNativeAuthBrowser(data.url)
  }

  async finishCode(result: Extract<NativeAuthReturn, { kind: 'code' }>) {
    const destination = await exchangeNativeAuthCode(this.auth, result)
    const acceptedAt = await this.store.getItem(GOOGLE_TERMS_KEY)
    await this.store.removeItem(GOOGLE_TERMS_KEY)
    const { data: { user }, error } = await this.auth.getUser()
    if (error || !user) throw new Error('The sign-in session could not be restored.')
    const googleIdentity = user.app_metadata?.provider === 'google' ||
      (Array.isArray(user.app_metadata?.providers) && user.app_metadata.providers.includes('google'))
    let hasTerms = Boolean(user.user_metadata?.terms_version)
    if (destination !== '/auth/reset-password' && googleIdentity && acceptedAt && Number.isFinite(Date.parse(acceptedAt)) && Date.now() - Date.parse(acceptedAt) >= 0 && Date.now() - Date.parse(acceptedAt) < 600_000) {
      const { error } = await this.auth.updateUser({ data: { terms_version: TERMS_VERSION, terms_accepted_at: acceptedAt } })
      if (error) throw new Error('Could not save your Terms acceptance. Please retry.')
      hasTerms = true
    }
    if (destination !== '/auth/reset-password' && !hasTerms)
      return { kind: 'needs-terms' } as const
    await this.session.restore()
    return { kind: 'route', path: destination } as const
  }

  async confirmEmail(result: Extract<NativeAuthReturn, { kind: 'confirmation' }>, confirmedByUser: boolean) {
    if (!confirmedByUser) throw new Error('Confirm this link to continue.')
    const path = await confirmNativeEmail(this.auth, result)
    await this.session.restore()
    return { kind: 'route', path } as const
  }

  async acceptTerms(acceptedTerms: boolean) {
    if (!acceptedTerms) throw new Error('Please accept the Terms of use to continue.')
    const { error } = await this.auth.updateUser({
      data: { terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString() },
    })
    if (error) throw new Error('Could not save your Terms acceptance. Please retry.')
    await this.session.restore()
    return { kind: 'route', path: '/start' } as const
  }
}
