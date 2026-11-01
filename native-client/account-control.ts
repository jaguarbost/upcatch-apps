import { getNativeRuntime } from './runtime-store'

export async function nativeSignOut() {
  await getNativeRuntime().session.signOut()
  window.dispatchEvent(new Event('upcatch:native-signout'))
}
