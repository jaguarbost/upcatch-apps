import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

function redirectTo(path: string, origin: string) {
  const response = NextResponse.redirect(new URL(path, origin), 303)
  response.headers.set('Referrer-Policy', 'no-referrer')
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const params = url.searchParams
  const isReset = params.get('next') === 'reset'
  if (params.has('error')) return redirectTo('/auth/login?oauth_error=1', url.origin)

  // Google OAuth and default Supabase emails use PKCE and return ?code=.
  const code = params.get('code')
  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const cookieStore=await cookies()
      const acceptedAt=cookieStore.get('upcatch-terms-accepted')?.value
      if(!isReset){
        const {data}=await supabase.auth.getUser()
        if(acceptedAt && data.user){
          const {error:termsError}=await supabase.auth.updateUser({data:{terms_version:'2026-09-29',terms_accepted_at:acceptedAt}})
          if(termsError)return redirectTo('/auth/accept-terms',url.origin)
          cookieStore.set('upcatch-terms-accepted','',{path:'/auth',maxAge:0})
        }
        if(data.user?.app_metadata?.provider==='google' && !acceptedAt && !data.user.user_metadata?.terms_version) return redirectTo('/auth/accept-terms',url.origin)
      }
      return redirectTo(isReset ? '/auth/reset-password' : '/start', url.origin)
    }
    // A failed code exchange does not establish a session or prove email confirmation.
    return redirectTo(isReset ? '/auth/forgot-password?expired=1' : '/auth/login?oauth_error=1', url.origin)
  }

  // Custom email templates using {{ .TokenHash }} confirm via an explicit button, resisting link scanners.
  const token = params.get('token_hash') ?? ''
  const type = params.get('type') ?? ''
  const response = redirectTo('/auth/confirm', url.origin)
  if (['signup', 'recovery', 'email_change'].includes(type) && /^[A-Za-z0-9_-]{16,256}$/.test(token)) {
    response.cookies.set('upcatch-confirmation', JSON.stringify({ token, type }), {
      httpOnly: true, secure: url.protocol === 'https:', sameSite: 'lax', path: '/auth', maxAge: 600,
    })
  } else response.cookies.set('upcatch-confirmation', '', { path: '/auth', maxAge: 0 })
  return response
}
