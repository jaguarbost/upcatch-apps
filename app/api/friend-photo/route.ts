import { NextRequest, NextResponse } from 'next/server'
import { requireMember } from '@/lib/server/member'
import { adminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const { supabase } = await requireMember()
  const id = request.nextUrl.searchParams.get('id')
  const token = request.nextUrl.searchParams.get('token')
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!id || !uuid.test(id) || (token && !uuid.test(token))) return new NextResponse(null, { status: 400 })
  const { data: path, error } = await supabase.rpc('qr_friend_photo_path', { p_user: id, p_token: token })
  if (error || typeof path !== 'string') return new NextResponse(null, { status: 404 })
  const { data, error: downloadError } = await adminClient().storage.from('profile-photos').download(path)
  if (downloadError || !data) return new NextResponse(null, { status: 404 })
  return new NextResponse(await data.arrayBuffer(), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
}
