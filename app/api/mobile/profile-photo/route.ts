import { nativeError, nativeJson, nativeOriginAllowed, nativePreflight } from '@/lib/server/native-api'
import { requireNativeMember } from '@/lib/server/native-member'
import { saveProfilePhoto } from '@/lib/server/profile-photo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!nativeOriginAllowed(request)) return nativeJson(request, { error: 'Forbidden' }, 403)
  try {
    const { user } = await requireNativeMember(request)
    const length = Number(request.headers.get('content-length'))
    if (Number.isFinite(length) && length > 6 * 1024 * 1024)
      return nativeJson(request, { error: 'Choose a photo under 5 MB.' }, 413)
    const form = await request.formData().catch(() => null)
    if (!form) return nativeJson(request, { error: 'Choose a photo under 5 MB.' }, 400)
    const result = await saveProfilePhoto(user.id, form.get('photo'))
    return nativeJson(request, result.error ? { error: result.error } : { message: result.message }, result.status)
  } catch (error) {
    return nativeError(request, error)
  }
}

export function OPTIONS(request: Request) {
  return nativePreflight(request, 'POST')
}
