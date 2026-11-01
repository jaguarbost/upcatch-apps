import type { FormState } from '@/lib/forms'
import { createClient } from './supabase-client'
import { getNativeRuntime } from './runtime-store'

export async function saveDetails(_: FormState, form: FormData): Promise<FormState> {
  const runtime = getNativeRuntime()
  const { data: pilot } = await createClient().from('cities').select('id').eq('slug', 'manchester').eq('status', 'active').single()
  if (!pilot) return { error: 'Manchester is temporarily unavailable. Please try again.' }
  const { error } = await runtime.supabase.rpc('save_profile_birth', {
    p_name: String(form.get('name') ?? '').trim(),
    p_month: Number(form.get('birthMonth')),
    p_year: Number(form.get('birthYear')),
    p_city: pilot.id,
  })
  return error ? { error: 'Enter your name and valid birth month and year. You must be 18 or older; eligibility begins the month after your 18th birthday month.' }
    : { message: 'Details saved. Add your photo to finish.' }
}

export async function uploadPhoto(_: FormState, form: FormData): Promise<FormState> {
  const file = form.get('photo')
  if (!(file instanceof File)) return { error: 'Choose a photo to continue.' }
  try { return await getNativeRuntime().api.uploadPhoto(file) }
  catch (error) { return { error: error instanceof Error ? error.message : 'Photo upload failed. Please retry.' } }
}
