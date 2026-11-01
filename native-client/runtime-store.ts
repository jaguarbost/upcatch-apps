import type { createNativeRuntime } from '@/lib/native/runtime'

type NativeRuntime = Awaited<ReturnType<typeof createNativeRuntime>>
let active: NativeRuntime | null = null
export function setNativeRuntime(runtime: NativeRuntime | null) { active = runtime }
export function getNativeRuntime() {
  if (!active) throw new Error('Your account is still loading. Please retry.')
  return active
}
