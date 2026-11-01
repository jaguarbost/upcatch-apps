import { after } from 'next/server'
import { nativeError, nativeJson, nativeOriginAllowed, nativePreflight } from '@/lib/server/native-api'
import { requireNativeMember } from '@/lib/server/native-member'
import { deliverMemberNotifications } from '@/lib/server/notifications'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!nativeOriginAllowed(request)) return nativeJson(request, { error: 'Forbidden' }, 403)
  try {
    const { user } = await requireNativeMember(request)
    after(async () => { await deliverMemberNotifications(user.id).catch(() => undefined) })
    return nativeJson(request, { ok: true })
  } catch (error) {
    return nativeError(request, error)
  }
}

export function OPTIONS(request: Request) {
  return nativePreflight(request, 'POST')
}
