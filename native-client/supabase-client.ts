import type { SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null
export function setNativeSupabaseClient(value: SupabaseClient | null) { client = value }
export function createClient() {
  if (!client) throw new Error('Your account is still loading. Please retry.')
  return client
}
