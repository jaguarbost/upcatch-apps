import 'server-only'
import { randomUUID } from 'node:crypto'
import { adminClient } from '@/lib/supabase/admin'
import { MAX_PHOTO_BYTES, normalizePhoto } from './image'
import { deliverNotifications } from './notifications'

type PhotoResult = { status: 200 | 400 | 409 | 429 | 503; message?: string; error?: string }

export async function saveProfilePhoto(userId: string, file: FormDataEntryValue | null): Promise<PhotoResult> {
  if (!(file instanceof File) || !file.size || file.size > MAX_PHOTO_BYTES)
    return { status: 400, error: 'Choose a photo under 5 MB.' }

  const admin = adminClient()
  const { data: allowed, error: limitError } = await admin.rpc('reserve_photo_upload', { p_user: userId })
  if (limitError) return { status: 503, error: 'Photo uploads are temporarily unavailable.' }
  if (!allowed) return { status: 429, error: 'Too many photo uploads. Please wait and try again later.' }

  let bytes: Buffer
  try {
    bytes = await normalizePhoto(new Uint8Array(await file.arrayBuffer()))
  } catch (error) {
    return { status: 400, error: error instanceof Error ? error.message : 'This image could not be read.' }
  }

  const objectPath = `${userId}/${randomUUID()}.jpg`
  const { error: uploadError } = await admin.storage.from('profile-photos').upload(objectPath, bytes, { contentType: 'image/jpeg', upsert: false })
  if (uploadError) return { status: 503, error: 'Photo upload failed. Please try again.' }

  const { error: saveError } = await admin.rpc('finalize_profile_photo', { p_user: userId, p_path: objectPath })
  if (saveError) {
    await admin.storage.from('profile-photos').remove([objectPath])
    return { status: 409, error: 'Save your profile details first, then try uploading again.' }
  }

  // The welcome job is committed with the profile. Cron can retry delivery.
  await deliverNotifications(userId).catch(() => undefined)
  return { status: 200, message: 'Photo saved.' }
}
