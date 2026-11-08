import { StrictMode, useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AccountShell } from '@/components/account/shell'
import { UpCatchApp } from '@/components/upcatch/upcatch-app'
import { LogoMark } from '@/components/upcatch/brand-badge'
import { PrimaryButton } from '@/components/upcatch/primitives'
import { createNativeRuntime } from '@/lib/native/runtime'
import type { NativeAuthReturn } from '@/lib/native/return-links'
import { parseUpCatchAppLink } from '@/lib/app-links'
import type { LiveBootstrap } from '@/lib/live-model'
import { listenForNativePushTaps } from '@/lib/push-client'
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { nativePublicConfig } from './config'
import { installNativeApiBridge, installPrivateImageBridge } from './api-bridge'
import { setNativeSupabaseClient } from './supabase-client'
import { setNativeRuntime } from './runtime-store'
import {
  AcceptTermsScreen, CheckEmailScreen, ConfirmScreen, ForgotScreen, LoginScreen,
  PrivacyRequestsScreen, PrivacyScreen, ResetScreen, SignUpScreen,
} from './screens'
import './fonts.css'
import './styles.css'

type Runtime = Awaited<ReturnType<typeof createNativeRuntime>>
type Confirmation = Extract<NativeAuthReturn, { kind: 'confirmation' }>

function navigate(path: string, replace = false) {
  if (window.location.pathname + window.location.search + window.location.hash === path) return
  if (replace) window.history.replaceState(null, '', path)
  else window.history.pushState(null, '', path)
  window.dispatchEvent(new Event('upcatch:navigate'))
}

function StartupScreen() {
  return <div className="native-login-background">
    <main className="grid min-h-dvh place-items-center" role="status" aria-live="polite">
      <LogoMark size={96} />
      <span className="sr-only">Opening UpCatch</span>
    </main>
  </div>
}

function NativeClient() {
  const [path, setPath] = useState(window.location.pathname)
  const [runtime, setRuntime] = useState<Runtime | null>(null)
  const [bootstrap, setBootstrap] = useState<LiveBootstrap | null>(null)
  const [pendingConfirmation, setPendingConfirmation] = useState<Confirmation | null>(null)
  const [notice, setNotice] = useState('')
  const [restoreFailed, setRestoreFailed] = useState(false)
  const [startupChecked, setStartupChecked] = useState(false)
  const [epoch, setEpoch] = useState(0)
  const renderedMember = useRef<string | null>(null)
  const pendingAppPath = useRef<string | null>(null)

  useEffect(() => {
    const update = () => setPath(window.location.pathname)
    window.addEventListener('popstate', update)
    window.addEventListener('upcatch:navigate', update)
    return () => { window.removeEventListener('popstate', update); window.removeEventListener('upcatch:navigate', update) }
  }, [])

  const loadMember = useCallback(async (active: Runtime) => {
    const member = await active.session.restore()
    if (!member) { renderedMember.current = null; setBootstrap(null); setRestoreFailed(false); navigate('/auth/login', true); return }
    const { data: { user }, error: userError } = await active.supabase.auth.getUser()
    if (userError || !user) throw new Error('Your sign-in could not be checked. Please retry.')
    if (!user.user_metadata?.terms_version) { setBootstrap(null); setRestoreFailed(false); navigate('/auth/accept-terms', true); return }
    const initial = await active.api.bootstrap()
    setNotice('')
    setRestoreFailed(false)
    setBootstrap(initial)
    if (renderedMember.current !== initial.memberId) {
      renderedMember.current = initial.memberId
      setEpoch(value => value + 1)
    }
    const destination = initial.completed ? pendingAppPath.current ?? '/app' : '/onboarding'
    if (initial.completed) pendingAppPath.current = null
    navigate(destination, true)
  }, [])

  const showLoadError = useCallback(async (active: Runtime | null, error: unknown) => {
    setNotice(error instanceof Error ? error.message : 'UpCatch could not connect. Please try again.')
    const hasSession = active ? await active.supabase.auth.getSession()
      .then(result => Boolean(result.data.session)).catch(() => true) : false
    if (!hasSession) { renderedMember.current = null; setBootstrap(null) }
    setRestoreFailed(hasSession)
    navigate(hasSession ? '/auth/reconnect' : '/auth/login', true)
  }, [])

  useEffect(() => {
    let mounted = true
    let releaseApi: () => void = () => undefined
    let releaseImages: () => void = () => undefined
    let releaseLinks: () => Promise<void> = () => Promise.resolve()
    let releasePush: () => void = () => undefined
    let releaseResume: () => Promise<void> = () => Promise.resolve()
    let releaseAppLinks: () => Promise<void> = () => Promise.resolve()
    let active: Runtime | null = null
    const refresh = (active: Runtime) => {
      void loadMember(active).catch(error => { void showLoadError(active, error) })
    }
    void (async () => {
      try {
        const current = await createNativeRuntime(nativePublicConfig, () => {
          releaseImages()
          if (active) releaseImages = installPrivateImageBridge(active.api)
          if (mounted) { renderedMember.current = null; setBootstrap(null); setEpoch(value => value + 1) }
        })
        active = current
        if (!mounted) return
        setNativeRuntime(current)
        setNativeSupabaseClient(current.supabase)
        setRuntime(current)
        releaseApi = installNativeApiBridge(current.api)
        releaseImages = installPrivateImageBridge(current.api)
        releaseLinks = await current.authFlow.listen(async result => {
          if (!mounted) return
          await Browser.close().catch(() => undefined)
          if (result.kind === 'error') { setNotice('Sign-in was not completed. Please try again.'); navigate('/auth/login'); return }
          if (result.kind === 'confirmation') { setPendingConfirmation(result); navigate('/auth/confirm'); return }
          const completed = await current.authFlow.finishCode(result)
          if (completed.kind === 'needs-terms') navigate('/auth/accept-terms')
          else if (completed.path === '/auth/reset-password') navigate(completed.path)
          else await loadMember(current)
        }, error => {
          if (!mounted) return
          void showLoadError(current, error)
        })
        const openAppLink = (raw: string) => {
          const destination = parseUpCatchAppLink(raw)
          if (!destination || !mounted) return
          pendingAppPath.current = destination
          if (renderedMember.current) {
            navigate(destination, true)
            setEpoch(value => value + 1)
          }
        }
        const appLinkListener = await App.addListener('appUrlOpen', event => openAppLink(event.url))
        releaseAppLinks = () => appLinkListener.remove()
        const launchLink = await App.getLaunchUrl()
        if (launchLink?.url) openAppLink(launchLink.url)
        const reload = () => refresh(current)
        window.addEventListener('upcatch:native-reload', reload)
        window.addEventListener('upcatch:native-signout', reload)
        const resume = await App.addListener('appStateChange', event => {
          if (event.isActive && ['/app', '/onboarding'].includes(window.location.pathname)) refresh(current)
        })
        releaseResume = async () => {
          window.removeEventListener('upcatch:native-reload', reload)
          window.removeEventListener('upcatch:native-signout', reload)
          await resume.remove()
        }
        // A stalled notification SDK must not hold up account restoration.
        void listenForNativePushTaps((route, chat, post) => {
          if (route === 'wall' || route === 'nudges') openAppLink(`uk.co.upcatch.app://app/${route}`)
          if (route === 'messages') {
            const query = chat === 'scheduled' && post ? `?chat=scheduled&post=${encodeURIComponent(post)}` : '?chat=live'
            openAppLink(`uk.co.upcatch.app://app/messages${query}`)
          }
          void refresh(current)
        }).then(release => {
          if (mounted) releasePush = release
          else release()
        }).catch(() => undefined)
        if (!['/auth/confirm', '/auth/reset-password', '/auth/accept-terms'].includes(window.location.pathname)) {
          await loadMember(current)
        }
      } catch (error) {
        if (mounted) {
          await showLoadError(active, error)
        }
      } finally {
        if (mounted) setStartupChecked(true)
      }
    })()
    return () => {
      mounted = false
      releasePush(); void releaseResume(); void releaseAppLinks(); void releaseLinks(); releaseImages(); releaseApi()
      setNativeRuntime(null); setNativeSupabaseClient(null)
    }
  }, [loadMember, showLoadError])

  if (!startupChecked) return <StartupScreen />
  if (!runtime) return <AccountShell title="UpCatch" description="Your account is getting ready.">{notice && <p role="status" className="rounded-xl bg-card p-4 text-sm">{notice}</p>}</AccountShell>
  const ready = () => loadMember(runtime).catch(async error => { await showLoadError(runtime, error); throw error })
  if (restoreFailed) return <AccountShell title="You're signed in" description="UpCatch couldn't load your account yet.">
    <p role="status" className="rounded-xl bg-primary/10 p-3 text-sm">{notice}</p>
    <PrimaryButton onClick={() => { void ready().catch(() => undefined) }} className="w-full">Try again</PrimaryButton>
    <button className="text-sm font-bold text-primary" onClick={() => { void runtime.session.signOut().then(() => { setRestoreFailed(false); setNotice(''); navigate('/auth/login') }).catch(error => setNotice(error instanceof Error ? error.message : 'Sign out could not be completed.')) }}>Use another account</button>
  </AccountShell>
  if (path === '/auth/signup') return <SignUpScreen runtime={runtime} navigate={navigate} />
  if (path === '/auth/check-email') return <CheckEmailScreen runtime={runtime} navigate={navigate} reset={new URLSearchParams(window.location.search).has('reset')} />
  if (path === '/auth/forgot-password') return <ForgotScreen runtime={runtime} navigate={navigate} />
  if (path === '/auth/confirm') return <ConfirmScreen runtime={runtime} pending={pendingConfirmation} ready={ready} navigate={navigate} />
  if (path === '/auth/reset-password') return <ResetScreen ready={ready} />
  if (path === '/auth/accept-terms') return <AcceptTermsScreen runtime={runtime} ready={ready} />
  if (path === '/privacy' || path === '/terms') return <PrivacyScreen path={path} />
  if (path === '/privacy/requests' && bootstrap) return <PrivacyRequestsScreen />
  if (bootstrap) return <UpCatchApp key={`${bootstrap.memberId}:${epoch}`} initial={bootstrap} />
  return <LoginScreen runtime={runtime} navigate={navigate} ready={ready} notice={notice} />
}

createRoot(document.getElementById('root')!).render(<StrictMode><NativeClient /></StrictMode>)
