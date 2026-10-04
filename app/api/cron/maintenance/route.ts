import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { deliverNotifications } from '@/lib/server/notifications'
export const maxDuration=60
export async function GET(request:Request) {
  const secret=process.env.CRON_SECRET
  const actual=Buffer.from(request.headers.get('authorization')??'')
  const expected=Buffer.from('Bearer '+(secret??''))
  if(!secret || actual.length!==expected.length || !timingSafeEqual(actual,expected))
    return new Response('Unauthorized',{status:401})
  const admin=adminClient()
  const delivered=await deliverNotifications()
  const {data:obsolete,error}=await admin.rpc('obsolete_photo_objects',{p_limit:50})
  if(error) return new Response('Photo cleanup query failed',{status:500})
  if(obsolete?.length){
    const {error:removeError}=await admin.storage.from('profile-photos').remove(obsolete.map((o:{path:string})=>o.path))
    if(removeError)return new Response('Photo cleanup failed',{status:500})
  }
  const {error:pruneError}=await admin.rpc('prune_notification_jobs')
  if(pruneError)return new Response('Maintenance failed',{status:500})
  return NextResponse.json({...delivered,photosRemoved:obsolete?.length??0})
}
