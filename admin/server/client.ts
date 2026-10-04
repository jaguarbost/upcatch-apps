import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Deliberately self-contained: no consumer-app imports or service-role credentials.
export async function adminSession() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) throw new Error('Admin authentication is not configured.')
  const store = await cookies()
  const client = createServerClient(url, key, { cookies: {
    getAll: () => store.getAll(),
    setAll(values) {
      try { values.forEach(({ name, value, options }) => store.set(name, value, options)) }
      catch { /* The host session proxy refreshes cookies for Server Components. */ }
    },
  } })
  const { data: { user }, error } = await client.auth.getUser()
  if (error && (error.name === 'AuthRetryableFetchError' || (error.status ?? 0) >= 500)) {
    throw new Error('Admin sign-in is temporarily unavailable.')
  }
  return { client, user: error || !user?.email_confirmed_at ? null : user }
}
