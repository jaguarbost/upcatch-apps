import 'server-only'
import { siteUrl } from './member'

// Both domains belong to this app; previews/local requests must match their own origin.
export function isAppOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return false
  if (process.env.VERCEL_ENV === 'production') {
    return origin === 'https://www.upcatch.co.uk' || origin === 'https://upcatch.co.uk'
  }
  return origin === new URL(request.url).origin && origin === siteUrl()
}
