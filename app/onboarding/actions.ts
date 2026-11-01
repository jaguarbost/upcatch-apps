'use server'
import { revalidatePath } from 'next/cache'
import { requireMember } from '@/lib/server/member'
import { saveProfilePhoto } from '@/lib/server/profile-photo'
import type { FormState } from '@/lib/forms'
export async function saveDetails(_: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireMember()
  const {data:pilot}=await supabase.from('cities').select('id').eq('slug','manchester').eq('status','active').single()
  if(!pilot)return {error:'Manchester is temporarily unavailable. Please try again.'}
  const city=pilot.id
  const { error } = await supabase.rpc('save_profile_birth', {
    p_name: String(form.get('name') ?? '').trim(), p_month: Number(form.get('birthMonth')), p_year: Number(form.get('birthYear')), p_city: city || null,
  })
  if (error) return { error: 'Enter your name and valid birth month and year. You must be 18 or older; eligibility begins the month after your 18th birthday month.' }
  revalidatePath('/onboarding')
  return { message: 'Details saved. Add your photo to finish.' }
}
export async function uploadPhoto(_: FormState, form: FormData): Promise<FormState> {
  const { user } = await requireMember()
  const result = await saveProfilePhoto(user.id, form.get('photo'))
  if (result.error) return { error: result.error }
  revalidatePath('/account')
  return { message: result.message }
}
