import { nativeError, nativeJson, nativeOriginAllowed, nativePreflight } from '@/lib/server/native-api'
import { loadLiveBootstrap } from '@/lib/server/live-bootstrap'
import { requireNativeMember } from '@/lib/server/native-member'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!nativeOriginAllowed(request)) return nativeJson(request, { error: 'Forbidden' }, 403)
  try {
    const { supabase, profile } = await requireNativeMember(request)
    return nativeJson(request, await loadLiveBootstrap(supabase, profile))
  } catch (error) {
    return nativeError(request, error)
  }
}

export function OPTIONS(request: Request) {
  return nativePreflight(request, 'GET')
}
