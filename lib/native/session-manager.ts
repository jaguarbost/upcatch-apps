import type { SupabaseClient } from '@supabase/supabase-js'
import { MobileApiError, type MobileApi, type NativeSession } from './api-client'
import { ACTIVE_MEMBER_KEY } from './storage-keys'

type Auth = Pick<SupabaseClient['auth'], 'getSession' | 'signInWithPassword' | 'signOut'>
type IdentityStore = {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}

export class NativeSessionManager {
  private member: NativeSession | null = null

  constructor(
    private readonly auth: Auth,
    private readonly api: Pick<MobileApi, 'session'>,
    private readonly identityStore: IdentityStore,
    private readonly detachPush: () => Promise<void>,
    private readonly clearAccountState: () => void | Promise<void>,
  ) {}

  current() { return this.member }

  async restore() {
    const previousId = await this.identityStore.getItem(ACTIVE_MEMBER_KEY)
    const { data, error } = await this.auth.getSession()
    if (error) throw error
    if (!data.session) {
      // A session may have expired while the app was closed. Remove any old
      // push binding and private UI state before showing sign-in.
      await this.detachPush()
      await this.identityStore.removeItem(ACTIVE_MEMBER_KEY)
      this.member = null
      await this.clearAccountState()
      return null
    }

    let verified: NativeSession
    try {
      verified = await this.api.session()
    } catch (error) {
      if (error instanceof MobileApiError && error.status === 401)
        await this.signOut()
      throw error
    }

    if ((previousId && previousId !== verified.memberId) || (this.member && this.member.memberId !== verified.memberId)) {
      await this.detachPush()
      await this.clearAccountState()
    }
    await this.identityStore.setItem(ACTIVE_MEMBER_KEY, verified.memberId)
    this.member = verified
    return verified
  }

  async signInWithPassword(email: string, password: string) {
    const { data, error } = await this.auth.getSession()
    if (error) throw error
    if (data.session || await this.identityStore.getItem(ACTIVE_MEMBER_KEY)) await this.signOut()
    const signedIn = await this.auth.signInWithPassword({ email, password })
    if (signedIn.error) throw signedIn.error
    return this.restore()
  }

  async signOut() {
    // Account switching must never bind the next account to the old alias.
    await this.detachPush()
    const { error } = await this.auth.signOut({ scope: 'local' })
    if (error) throw error
    await this.identityStore.removeItem(ACTIVE_MEMBER_KEY)
    this.member = null
    await this.clearAccountState()
  }
}
