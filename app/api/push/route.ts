import { after, NextResponse } from 'next/server'
import { requireMember } from '@/lib/server/member'
import { isAppOrigin } from '@/lib/server/request-origin'
import { pushAlias, deliverNotifications } from '@/lib/server/notifications'
export async function GET() {
  const { supabase, user } = await requireMember()
  if (!process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || !process.env.ONESIGNAL_API_KEY || !process.env.ONESIGNAL_ALIAS_SECRET || process.env.ONESIGNAL_ALIAS_SECRET.length < 32)
    return NextResponse.json({ error: 'Notifications are not available yet.' }, { status: 503 })
  const { data, error } = await supabase.from('notification_preferences').select('push_enabled').eq('user_id',user.id).single()
  if (error) return NextResponse.json({error:'Notification preferences are unavailable.'},{status:503})
  return NextResponse.json({ alias: pushAlias(user.id), enabled: data.push_enabled }, { headers: { 'Cache-Control': 'private, no-store' } })
}
export async function POST(request: Request) {
  if (!isAppOrigin(request)) return new Response('Forbidden', { status: 403 })
  const { supabase, user } = await requireMember()
  const body = await request.json().catch(() => null)
  if (typeof body?.enabled !== 'boolean') return new Response('Invalid preference', { status: 400 })
  if (body.enabled && (!process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || !process.env.ONESIGNAL_API_KEY || !process.env.ONESIGNAL_ALIAS_SECRET || process.env.ONESIGNAL_ALIAS_SECRET.length < 32))
    return new Response('Notifications are not available yet.', { status: 503 })
  const { error } = await supabase.rpc('set_push_preference', { p_enabled: body.enabled })
  if (error) return new Response('Preference could not be saved', { status: 503 })
  // A delivery failure must not turn a saved preference into a failed toggle.
  if (body.enabled) after(async () => {
    await supabase.rpc('queue_welcome_push')
    await deliverNotifications(user.id).catch(() => undefined)
  })
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } })
}
