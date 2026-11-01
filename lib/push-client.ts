'use client'
import { Capacitor } from '@capacitor/core'
import { deviceKind, isInstalledApp } from './browser-permissions'
export const SIGNUP_PUSH_CHOICE_KEY = 'upcatch:push-signup-choice'

type OneSignalClient = {
  init(options: Record<string, unknown>): Promise<void>
  login(alias: string): Promise<void>
  logout(): Promise<void>
  Notifications: { permission: boolean; requestPermission(): Promise<void> }
  User: { PushSubscription: { optedIn: boolean; optIn(): Promise<void>; optOut(): Promise<void> } }
}
declare global {
  interface Window {
    OneSignalDeferred?: Array<(client: OneSignalClient) => void>
    upcatchPush?: Promise<OneSignalClient>
  }
}
let nativePush: Promise<typeof import('@onesignal/capacitor-plugin')['default']> | undefined
function loadNativePush() {
  if (!nativePush) nativePush = import('@onesignal/capacitor-plugin').then(async ({ default: client }) => {
    const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID
    if (!appId) throw new Error('Notifications are not available yet.')
    await client.initialize(appId)
    return client
  }).catch(error => { nativePush = undefined; throw error })
  return nativePush
}

async function waitForNativePushToken(client: typeof import('@onesignal/capacitor-plugin')['default']) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (await client.User.pushSubscription.getTokenAsync()) return true
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  return false
}
export function loadPush() {
  if(!window.upcatchPush){
    window.upcatchPush=new Promise<OneSignalClient>((resolve,reject)=>{
      const script=document.createElement('script')
      const initialise=async(client:OneSignalClient)=>{
        try{
          await client.init({
            appId:process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID,
            allowLocalhostAsSecureOrigin:process.env.NODE_ENV!=='production',
            serviceWorkerPath:'OneSignalSDKWorker.js',
            notifyButton:{enable:false},
            promptOptions:{slidedown:{prompts:[{type:'push',autoPrompt:false}]}},
            welcomeNotification:{disable:true},
          })
          resolve(client)
        }catch(error){reject(error)}
      }
      window.OneSignalDeferred=window.OneSignalDeferred??[]
      window.OneSignalDeferred.push(initialise)
      script.src='https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js'
      script.defer=true
      script.onerror=()=>{
        if(Array.isArray(window.OneSignalDeferred)){
          const index=window.OneSignalDeferred.indexOf(initialise)
          if(index>=0)window.OneSignalDeferred.splice(index,1)
        }
        script.remove()
        reject(new Error('Push could not load. Please check your connection and retry.'))
      }
      document.head.appendChild(script)
    }).catch(error=>{window.upcatchPush=undefined;throw error})
  }
  // Timeout this attempt while retaining the one SDK initialization for a later retry.
  const pending=window.upcatchPush
  return new Promise<OneSignalClient>((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Notifications are taking longer to connect. Please retry.')),15000)
    pending.then(client=>{clearTimeout(timer);resolve(client)},error=>{clearTimeout(timer);reject(error)})
  })
}
export async function detachPush() {
  if (Capacitor.isNativePlatform()) {
    if (!process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID) return
    const client = await loadNativePush()
    await client.User.pushSubscription.optOut()
    await client.logout()
    return
  }
  if(!window.upcatchPush) return
  const client=await window.upcatchPush
  await client.User.PushSubscription.optOut()
  await client.logout()
}

export async function setPushEnabled(enabled: boolean) {
  if (!enabled) {
    const response = await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: false }) })
    if (!response.ok) throw new Error('Notification preference could not be saved. Please retry.')
    // The server preference is authoritative, including when the SDK is offline.
    await detachPush().catch(() => undefined)
    return
  }
  if (!process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID) throw new Error('Notifications are not available yet. You can continue without them.')
  if (Capacitor.isNativePlatform()) {
    const response = await fetch('/api/push')
    if (!response.ok) throw new Error('Notifications are not available yet. Please try again later.')
    const { alias } = await response.json()
    const client = await loadNativePush()
    const permission = await client.Notifications.requestPermission(false)
    if (!permission) throw new Error('Notifications are blocked. Allow UpCatch in your device settings, or continue without them.')
    await client.login(alias)
    await client.User.pushSubscription.optIn()
    if (!await client.User.pushSubscription.getOptedInAsync()) throw new Error('This device could not subscribe. Please retry or check your notification settings.')
    if (!await waitForNativePushToken(client)) {
      await client.User.pushSubscription.optOut().catch(() => undefined)
      throw new Error('This device has not received a push token. Check Google Play services and the Android FCM setup, then retry.')
    }
    try {
      const saved = await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: true }) })
      if (!saved.ok) throw new Error('Notification preference could not be saved. Please retry.')
    } catch (error) {
      await client.User.pushSubscription.optOut().catch(() => undefined)
      throw error
    }
    return
  }
  if (deviceKind() === 'ios' && !isInstalledApp()) throw new Error('On iPhone or iPad, add UpCatch to your Home Screen and open it there, then enable notifications.')
  if (!('Notification' in window) || !('serviceWorker' in navigator)) throw new Error('This browser does not support notifications. On iPhone, add UpCatch to your Home Screen, then open it there.')
  const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
  if (permission !== 'granted') throw new Error('Notifications are blocked. Allow them in your browser settings, or continue without them.')
  const response = await fetch('/api/push')
  if (!response.ok) throw new Error('Notifications are not available yet. Please try again later.')
  const { alias } = await response.json()
  const client = await loadPush()
  await client.login(alias)
  await client.User.PushSubscription.optIn()
  if(!client.User.PushSubscription.optedIn)throw new Error('This device could not subscribe. Please retry or check your browser notification settings.')
  try {
    const saved = await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: true }) })
    if (!saved.ok) throw new Error('Notification preference could not be saved. Please retry.')
  } catch (error) {
    await client.User.PushSubscription.optOut().catch(() => undefined)
    throw error
  }
}

export async function restorePush() {
  if (Capacitor.isNativePlatform()) {
    if (!process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID) return false
    const response = await fetch('/api/push')
    if (!response.ok) return false
    const { alias, enabled } = await response.json()
    if (!enabled) { await detachPush().catch(() => undefined); return false }
    const client = await loadNativePush()
    await client.login(alias)
    if (!await client.Notifications.hasPermission()) return false
    await client.User.pushSubscription.optIn()
    return await client.User.pushSubscription.getOptedInAsync() && Boolean(await client.User.pushSubscription.getTokenAsync())
  }
  if (!process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || !('Notification' in window) || Notification.permission !== 'granted') return false
  const response = await fetch('/api/push')
  if (!response.ok) return false
  const { alias, enabled } = await response.json()
  if (!enabled) { await detachPush().catch(() => undefined); return false }
  const client = await loadPush()
  await client.login(alias)
  await client.User.PushSubscription.optIn()
  return true
}

// Register after restoring the native session. The client refreshes live state
// after a tap; notification payloads never grant access to a meetup.
export async function listenForNativePushTaps(onOpen: () => void) {
  if (!Capacitor.isNativePlatform() || !process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID) return () => undefined
  const client = await loadNativePush()
  const handler = (event: { notification: { additionalData?: object } }) => {
    const data = event.notification.additionalData as { route?: unknown } | undefined
    if (data?.route === 'app') onOpen()
  }
  client.Notifications.addEventListener('click', handler)
  return () => client.Notifications.removeEventListener('click', handler)
}
