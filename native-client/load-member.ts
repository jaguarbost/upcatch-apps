import type { createNativeRuntime } from '@/lib/native/runtime'

// These checks are independent, but both must pass before loading private UI.
export async function loadNativeMember(active: Awaited<ReturnType<typeof createNativeRuntime>>) {
  const checks = Promise.all([active.session.restore(), active.supabase.auth.getUser()])
  let timer: ReturnType<typeof setTimeout> | undefined
  let verified: Awaited<typeof checks>
  try {
    verified = await Promise.race([checks, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Checking your account took too long. Please check your connection and try again.')), 15000)
    })])
  } finally { clearTimeout(timer) }
  const [member, { data: { user }, error }] = verified
  if (!member) return { kind: 'anonymous' as const }
  if (error || !user || user.id !== member.memberId) throw new Error('Your sign-in could not be checked. Please retry.')
  if (!user.user_metadata?.terms_version) return { kind: 'terms' as const }
  const initial = await active.api.bootstrap()
  if (initial.memberId !== member.memberId) throw new Error('Your account changed. Please retry.')
  return { kind: 'ready' as const, initial: initial.photoSaved && initial.aboutPending ? { ...initial, completed: false } : initial }
}
