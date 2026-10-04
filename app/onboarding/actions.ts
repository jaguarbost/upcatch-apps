'use server'
import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { requireMember } from '@/lib/server/member'
import { adminClient } from '@/lib/supabase/admin'
import { normalizePhoto, MAX_PHOTO_BYTES } from '@/lib/server/image'
import { deliverNotifications } from '@/lib/server/notifications'
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
  const file = form.get('photo')
  if (!(file instanceof File) || file.size > MAX_PHOTO_BYTES || !file.size) return { error: 'Choose a photo under 5 MB.' }
  const admin = adminClient()
  const {data:allowed,error:limitError}=await admin.rpc('reserve_photo_upload',{p_user:user.id})
  if(limitError || !allowed)return {error:'Too many photo uploads. Please wait and try again later.'}
  let bytes: Buffer
  try { bytes = await normalizePhoto(new Uint8Array(await file.arrayBuffer())) }
  catch(error) { return { error: error instanceof Error ? error.message : 'This image could not be read.' } }
  const objectPath = user.id + '/' + randomUUID() + '.jpg'
  const { error: uploadError } = await admin.storage.from('profile-photos').upload(objectPath, bytes, { contentType: 'image/jpeg', upsert: false })
  if (uploadError) return { error: 'Photo upload failed. Please try again.' }
  const { error } = await admin.rpc('finalize_profile_photo', { p_user: user.id, p_path: objectPath })
  if (error) {
    await admin.storage.from('profile-photos').remove([objectPath])
    return { error: 'Save your profile details first, then try uploading again.' }
  }
  // The welcome job was committed with the profile. Failure here is recoverable by cron.
  await deliverNotifications(user.id).catch(() => undefined)
  revalidatePath('/account')
  return { message: 'Photo saved.' }
}
