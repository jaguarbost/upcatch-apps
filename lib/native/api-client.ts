import type { SupabaseClient } from '@supabase/supabase-js'
import type { LiveBootstrap } from '@/lib/live-model'

type NativeAuth = Pick<SupabaseClient['auth'], 'getSession' | 'refreshSession'>

export type NativeSession = {
  memberId: string
  email: string | null
  displayName: string | null
  onboardingComplete: boolean
}

export class MobileApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
  }
}

export class MobileAccountChangedError extends Error {
  constructor() { super('The signed-in account changed. Reload this screen.') }
}

export class MobileApi {
  private readonly origin: string

  constructor(baseUrl: string, private readonly auth: NativeAuth, private readonly send: typeof fetch = fetch.bind(globalThis)) {
    const url = new URL(baseUrl)
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
      throw new Error('The mobile API base URL must be an HTTPS origin.')
    this.origin = url.origin
  }

  private async request(path: string, init: RequestInit = {}) {
    const { data: { session }, error } = await this.auth.getSession()
    if (error || !session) throw new MobileApiError(401, 'Sign in to continue.')
    const memberId = session.user.id

    const call = async (token: string) => {
      const headers = new Headers(init.headers)
      headers.set('Authorization', `Bearer ${token}`)
      try {
        return await this.send(`${this.origin}/api/mobile/${path}`, { ...init, headers, cache: 'no-store' })
      } catch (cause) {
        if (cause instanceof TypeError) throw new MobileApiError(0, 'Could not reach UpCatch. Please check your connection and try again.')
        throw cause
      }
    }

    let response = await call(session.access_token)
    if (response.status === 401) {
      const refreshed = await this.auth.refreshSession()
      if (refreshed.error || !refreshed.data.session) throw new MobileApiError(401, 'Sign in to continue.')
      if (refreshed.data.session.user.id !== memberId) throw new MobileAccountChangedError()
      response = await call(refreshed.data.session.access_token)
    }

    const { data: { session: current } } = await this.auth.getSession()
    if (!current || current.user.id !== memberId) throw new MobileAccountChangedError()
    if (!response.ok) {
      const body = await response.json().catch(() => null)
      throw new MobileApiError(response.status, typeof body?.error === 'string' ? body.error : 'Request failed. Please retry.')
    }
    return response
  }

  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    return this.request(path, init).then(response => response.json() as Promise<T>)
  }

  session() { return this.json<NativeSession>('session') }
  bootstrap() { return this.json<LiveBootstrap>('bootstrap') }
  push() { return this.json<{ alias: string; enabled: boolean }>('push') }
  setPushEnabled(enabled: boolean) {
    return this.json<{ ok: true }>('push', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }),
    })
  }
  dispatchNotifications() { return this.json<{ ok: true }>('notifications', { method: 'POST' }) }
  uploadPhoto(file: File) {
    const body = new FormData()
    body.set('photo', file)
    return this.json<{ message: string }>('profile-photo', { method: 'POST', body })
  }
  async memberPhoto(meetupId: string) {
    return (await this.request(`member-photo?meetup=${encodeURIComponent(meetupId)}`)).blob()
  }
  async friendPhoto(id: string, token?: string) {
    const query = `id=${encodeURIComponent(id)}${token ? `&token=${encodeURIComponent(token)}` : ''}`
    return (await this.request(`friend-photo?${query}`)).blob()
  }
  async wallPhoto(postId: string) {
    return (await this.request(`wall-photo?post=${encodeURIComponent(postId)}`)).blob()
  }
}
