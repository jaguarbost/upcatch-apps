import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isSupabaseConfigured, supabaseConfig } from '@/lib/supabase/config'
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  if (!isSupabaseConfigured()) return response
  const { url, key } = supabaseConfig()
  const pendingCookies=new Map<string,{name:string;value:string;options:CookieOptions}>()
  const supabase = createServerClient(url, key, { cookies: {
    getAll: () => request.cookies.getAll(),
    setAll(values) {
      values.forEach(cookie => {request.cookies.set(cookie.name,cookie.value);pendingCookies.set(cookie.name,cookie)})
      response = NextResponse.next({ request })
      pendingCookies.forEach(({name,value,options})=>response.cookies.set(name,value,options))
    },
  } })
  await supabase.auth.getClaims()
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
export const config = { matcher: ['/upcatch-ops/:path*', '/', '/app/:path*', '/start', '/live/:path*', '/venues/:path*', '/account/:path*', '/onboarding/:path*', '/auth/:path*', '/api/push/:path*'] }
