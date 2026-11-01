import { nativeError, nativeImage, nativeJson, nativeOriginAllowed, nativePreflight } from '@/lib/server/native-api'
import { requireNativeMember } from '@/lib/server/native-member'
import { adminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: Request) {
  if (!nativeOriginAllowed(request)) return nativeJson(request, { error: 'Forbidden' }, 403)
  try {
    const { supabase } = await requireNativeMember(request)
    const params = new URL(request.url).searchParams
    const id = params.get('id')
    const token = params.get('token')
    if (!id || !uuid.test(id) || (token && !uuid.test(token))) return nativeJson(request, { error: 'Invalid friend' }, 400)
    const { data: path, error } = await supabase.rpc('qr_friend_photo_path', { p_user: id, p_token: token })
    if (error || typeof path !== 'string') return nativeJson(request, { error: 'Photo not found' }, 404)
    const { data, error: downloadError } = await adminClient().storage.from('profile-photos').download(path)
    if (downloadError || !data) return nativeJson(request, { error: 'Photo not found' }, 404)
    return nativeImage(request, await data.arrayBuffer())
  } catch (error) {
    return nativeError(request, error)
  }
}

export function OPTIONS(request: Request) {
  return nativePreflight(request, 'GET')
}
