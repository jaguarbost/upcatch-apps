import { nativeError, nativeJson, nativeOriginAllowed, nativePreflight } from '@/lib/server/native-api'
import { requireNativeMember } from '@/lib/server/native-member'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!nativeOriginAllowed(request)) return nativeJson(request, { error: 'Forbidden' }, 403)
  try {
    const { user, profile } = await requireNativeMember(request)
    return nativeJson(request, {
      memberId: user.id,
      email: user.email,
      displayName: profile.display_name,
      onboardingComplete: Boolean(profile.onboarding_completed_at),
    })
  } catch (error) {
    return nativeError(request, error)
  }
}

export function OPTIONS(request: Request) {
  return nativePreflight(request, 'GET')
}
