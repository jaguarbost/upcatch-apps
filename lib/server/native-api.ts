import 'server-only'
import { NativeAuthError } from './native-member'

const appOrigins = new Set(['capacitor://localhost', 'https://localhost', 'http://localhost'])

export function nativeHeaders(request: Request) {
  const origin = request.headers.get('origin')
  return {
    'Cache-Control': 'private, no-store',
    Vary: 'Origin',
    ...(origin && appOrigins.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
  }
}

export function nativeOriginAllowed(request: Request) {
  const origin = request.headers.get('origin')
  return !origin || appOrigins.has(origin)
}

export function nativeJson(request: Request, body: unknown, status = 200) {
  return Response.json(body, { status, headers: nativeHeaders(request) })
}

export function nativeImage(request: Request, bytes: ArrayBuffer) {
  return new Response(bytes, {
    headers: {
      ...nativeHeaders(request),
      'Content-Type': 'image/jpeg',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

export function nativeError(request: Request, error: unknown) {
  if (error instanceof NativeAuthError) return nativeJson(request, { error: error.message }, error.status)
  return nativeJson(request, { error: 'Service is temporarily unavailable.' }, 503)
}

export function nativePreflight(request: Request, methods: string) {
  const origin = request.headers.get('origin')
  if (!origin || !appOrigins.has(origin)) return nativeJson(request, { error: 'Forbidden' }, 403)
  const requestedMethod = request.headers.get('access-control-request-method')
  if (!requestedMethod || !methods.split(', ').includes(requestedMethod)) return nativeJson(request, { error: 'Forbidden' }, 403)
  return new Response(null, {
    status: 204,
    headers: {
      ...nativeHeaders(request),
      'Access-Control-Allow-Methods': methods,
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '600',
    },
  })
}
