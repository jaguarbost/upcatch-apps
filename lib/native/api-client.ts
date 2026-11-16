import type { SupabaseClient } from '@supabase/supabase-js'
import type { LiveBootstrap } from '@/lib/live-model'

type NativeAuth = Pick<SupabaseClient['auth'], 'getSession' | 'refreshSession'>

export type NativeSession = {
  memberId: string
  email: string | null
  displayName: string | null
  onboardingComplete: boolean
}

export type PhotoSaveResult = { message: string; photoSaved?: boolean; nextStep?: 'about' | 'app' }

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
      const controller = new AbortController()
      const abort = () => controller.abort()
      if (init.signal?.aborted) controller.abort()
      else init.signal?.addEventListener('abort', abort, { once: true })
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        return await Promise.race([
          this.send(`${this.origin}/api/mobile/${path}`, { ...init, headers, cache: 'no-store', signal: controller.signal }),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              reject(new MobileApiError(0, path === 'profile-photo'
                ? 'The upload is taking too long to confirm. Please check your connection and retry; your photo may already be saved.'
                : 'UpCatch took too long to respond. Please check your connection and try again.'))
              controller.abort()
            }, path === 'profile-photo' ? 45000 : 15000)
          }),
        ])
      } catch (cause) {
        if (cause instanceof TypeError) throw new MobileApiError(0, 'Could not reach UpCatch. Please check your connection and try again.')
        throw cause
      } finally {
        clearTimeout(timer)
        init.signal?.removeEventListener('abort', abort)
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
      const body = await this.readJson<{ error?: unknown }>(response).catch(() => null)
      throw new MobileApiError(response.status, typeof body?.error === 'string' ? body.error : 'Request failed. Please retry.')
    }
    return response
  }

  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    return this.request(path, init).then(response => this.readJson<T>(response))
  }

  private async readJson<T>(response: Response): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        response.json() as Promise<T>,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new MobileApiError(0, 'UpCatch could not finish reading the response. Please retry.')), 15000)
        }),
      ])
    } finally { clearTimeout(timer) }
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
  uploadPhoto(file: File, onboardingVersion?: 2) {
    const body = new FormData()
    body.set('photo', file)
    if (onboardingVersion === 2) body.set('onboardingVersion', '2')
    return this.json<PhotoSaveResult>('profile-photo', { method: 'POST', body })
  }
  async saveOnboardingAbout(bio: string, interests: string[]) {
    const response = await this.request('onboarding/about', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bio, interests }),
    })
    if (response.status !== 200) throw new MobileApiError(503, 'Your introduction was not confirmed as saved. Please retry this step.')
    return this.readJson<{ completed: boolean; message?: string }>(response)
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
