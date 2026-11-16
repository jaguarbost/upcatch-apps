'use client'

import { createClient } from '@/lib/supabase/client'
import { MobileApi, MobileApiError, type PhotoSaveResult } from './native/api-client'
import { validateOnboardingAbout } from './onboarding-flow'

// Vite resolves this to the existing secure native Supabase client. Only public
// configuration and the current member's bearer token enter these requests.
const api = () => new MobileApi(process.env.NEXT_PUBLIC_SITE_URL || 'https://www.upcatch.uk', createClient().auth)

export async function saveOnboardingPhoto(file: File): Promise<PhotoSaveResult> {
  const client = api()
  let failure: unknown
  try {
    const result = await client.uploadPhoto(file, 2)
    if (result?.photoSaved === true && (result.nextStep === 'about' || result.nextStep === 'app')) return result
    failure = new Error('The server did not confirm your photo was saved. Please retry.')
  } catch (error) {
    if (!(error instanceof SyntaxError) && (!(error instanceof MobileApiError) || (error.status !== 0 && error.status < 500))) throw error
    failure = error
  }
  // An interrupted response can follow a committed upload. Check the member's
  // saved progress before asking them to send the same image again.
  try {
    const progress = await client.bootstrap()
    if (progress.photoSaved && progress.aboutPending) return { photoSaved: true, nextStep: 'about', message: 'Photo saved.' }
    if (progress.photoSaved && progress.completed && !progress.aboutPending) return { photoSaved: true, nextStep: 'app', message: 'Photo saved.' }
  } catch { /* Keep the original upload error and selected file for retry. */ }
  throw failure
}

export async function saveOnboardingAbout(bio: string, interests: string[]) {
  const values = validateOnboardingAbout(bio, interests)
  if ('error' in values) throw new Error(values.error)
  const result = await api().saveOnboardingAbout(values.bio, values.interests)
  if (result?.completed !== true) throw new Error('Your introduction was not confirmed as saved. Please retry this step.')
}
