import { after } from 'next/server'
import { nativeError, nativeJson, nativeOriginAllowed, nativePreflight } from '@/lib/server/native-api'
import { requireNativeMember } from '@/lib/server/native-member'
import { deliverNotifications, pushAlias } from '@/lib/server/notifications'

export const dynamic = 'force-dynamic'

function pushAvailable() {
  return Boolean(process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID && process.env.ONESIGNAL_API_KEY &&
    process.env.ONESIGNAL_ALIAS_SECRET && process.env.ONESIGNAL_ALIAS_SECRET.length >= 32)
}

export async function GET(request: Request) {
  if (!nativeOriginAllowed(request)) return nativeJson(request, { error: 'Forbidden' }, 403)
  try {
    const { supabase, user } = await requireNativeMember(request)
    if (!pushAvailable()) return nativeJson(request, { error: 'Notifications are not available yet.' }, 503)
    const { data, error } = await supabase.from('notification_preferences').select('push_enabled').eq('user_id', user.id).single()
    if (error) return nativeJson(request, { error: 'Notification preferences are unavailable.' }, 503)
    return nativeJson(request, { alias: pushAlias(user.id), enabled: data.push_enabled })
  } catch (error) {
    return nativeError(request, error)
  }
}

export async function POST(request: Request) {
  if (!nativeOriginAllowed(request)) return nativeJson(request, { error: 'Forbidden' }, 403)
  try {
    const { supabase, user } = await requireNativeMember(request)
    const body = await request.json().catch(() => null)
    if (typeof body?.enabled !== 'boolean') return nativeJson(request, { error: 'Invalid preference' }, 400)
    if (body.enabled && !pushAvailable()) return nativeJson(request, { error: 'Notifications are not available yet.' }, 503)
    const { error } = await supabase.rpc('set_push_preference', { p_enabled: body.enabled })
    if (error) return nativeJson(request, { error: 'Preference could not be saved' }, 503)
    if (body.enabled) after(async () => {
      await supabase.rpc('queue_welcome_push')
      await deliverNotifications(user.id).catch(() => undefined)
    })
    return nativeJson(request, { ok: true })
  } catch (error) {
    return nativeError(request, error)
  }
}

export function OPTIONS(request: Request) {
  return nativePreflight(request, 'GET, POST')
}
