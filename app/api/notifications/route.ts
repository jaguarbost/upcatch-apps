import { after, NextResponse } from 'next/server'
import { requireMember } from '@/lib/server/member'
import { isAppOrigin } from '@/lib/server/request-origin'
import { deliverMemberNotifications } from '@/lib/server/notifications'
export async function POST(request:Request){
 if(!isAppOrigin(request))return new NextResponse(null,{status:403})
 const {user}=await requireMember()
 after(async()=>{await deliverMemberNotifications(user.id).catch(()=>undefined)})
 return NextResponse.json({ok:true},{headers:{'Cache-Control':'private, no-store'}})
}
