import { NextRequest, NextResponse } from 'next/server'
import { requireMember } from '@/lib/server/member'
import { adminClient } from '@/lib/supabase/admin'
export async function GET(request:NextRequest){
 const {supabase,user}=await requireMember()
 const meetup=request.nextUrl.searchParams.get('meetup')
 if(!meetup||! /^[0-9a-f-]{36}$/i.test(meetup))return new NextResponse(null,{status:400})
 const {data:own}=await supabase.from('meetup_participants').select('meetup_id').eq('meetup_id',meetup).eq('user_id',user.id).maybeSingle()
 if(!own)return new NextResponse(null,{status:404})
 const admin=adminClient()
 const {data:peer}=await admin.from('meetup_participants').select('user_id').eq('meetup_id',meetup).neq('user_id',user.id).maybeSingle()
 if(!peer)return new NextResponse(null,{status:404})
 const {data:profile}=await admin.from('profiles').select('photo_path').eq('id',peer.user_id).maybeSingle()
 if(!profile?.photo_path)return new NextResponse(null,{status:404})
 const {data,error}=await admin.storage.from('profile-photos').download(profile.photo_path)
 if(error||!data)return new NextResponse(null,{status:404})
 return new NextResponse(await data.arrayBuffer(),{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}})
}
