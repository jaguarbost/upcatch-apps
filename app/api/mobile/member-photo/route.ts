import { nativeError, nativeImage, nativeJson, nativeOriginAllowed, nativePreflight } from '@/lib/server/native-api'
import { requireNativeMember } from '@/lib/server/native-member'
import { adminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!nativeOriginAllowed(request)) return nativeJson(request, { error: 'Forbidden' }, 403)
  try {
    const { supabase, user } = await requireNativeMember(request)
    const meetup = new URL(request.url).searchParams.get('meetup')
    if (!meetup || !/^[0-9a-f-]{36}$/i.test(meetup)) return nativeJson(request, { error: 'Invalid meetup' }, 400)
    const { data: own, error: ownError } = await supabase.from('meetup_participants').select('meetup_id').eq('meetup_id', meetup).eq('user_id', user.id).maybeSingle()
    if (ownError) return nativeJson(request, { error: 'Photo is temporarily unavailable.' }, 503)
    if (!own) return nativeJson(request, { error: 'Photo not found' }, 404)
    const admin = adminClient()
    const { data: peer } = await admin.from('meetup_participants').select('user_id').eq('meetup_id', meetup).neq('user_id', user.id).maybeSingle()
    if (!peer) return nativeJson(request, { error: 'Photo not found' }, 404)
    const { data: profile } = await admin.from('profiles').select('photo_path').eq('id', peer.user_id).maybeSingle()
    if (!profile?.photo_path) return nativeJson(request, { error: 'Photo not found' }, 404)
    const { data, error } = await admin.storage.from('profile-photos').download(profile.photo_path)
    if (error || !data) return nativeJson(request, { error: 'Photo not found' }, 404)
    return nativeImage(request, await data.arrayBuffer())
  } catch (error) {
    return nativeError(request, error)
  }
}

export function OPTIONS(request: Request) {
  return nativePreflight(request, 'GET')
}
