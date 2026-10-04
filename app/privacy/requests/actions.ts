'use server'
import { requireMember } from '@/lib/server/member'
import type { FormState } from '@/lib/forms'
export async function requestPrivacy(_:FormState,form:FormData):Promise<FormState>{
 const {supabase}=await requireMember()
 const {error}=await supabase.rpc('request_privacy_right',{p_kind:String(form.get('kind')??'')})
 if(error)return {error:'Your request could not be saved. Please try again.'}
 return {message:'Your request has been recorded for operator review. This does not automatically delete your account.'}
}
