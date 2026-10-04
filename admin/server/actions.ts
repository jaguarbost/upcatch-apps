'use server'
import { revalidatePath } from 'next/cache'
import { adminSession } from './client'
import { ADMIN_PATH } from '../config'
import type { ActionState } from '../types'

export async function updateEntitlement(_: ActionState, form: FormData): Promise<ActionState> {
  const id = String(form.get('userId') ?? '')
  const remaining = String(form.get('remaining') ?? '').trim()
  const version = String(form.get('version') ?? '')
  const subscription = String(form.get('subscription') ?? '')
  const reason = String(form.get('reason') ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^\d+$/.test(version)
    || (remaining !== '' && (!/^\d+$/.test(remaining) || Number(remaining) > 100000))
    || !['free', 'active', 'paused', 'cancelled'].includes(subscription)
    || reason.length < 3 || reason.length > 500) return { error: 'Check the allowance, subscription and reason.' }
  try {
    const { client, user } = await adminSession()
    if (!user) return { error: 'Sign in again before saving.' }
    const { error } = await client.rpc('admin_update_entitlement', {
      p_user: id, p_remaining: remaining === '' ? null : Number(remaining),
      p_subscription: subscription, p_version: Number(version), p_reason: reason,
    })
    if (error) return { error: error.code === '42501' ? 'Admin access is required.'
      : error.message === 'Member changed; refresh and try again' ? error.message
      : 'Could not save this change. Refresh and try again.' }
    revalidatePath(ADMIN_PATH)
    return { success: 'Allowance and subscription saved.' }
  } catch { return { error: 'Saving is temporarily unavailable. Please try again.' } }
}
