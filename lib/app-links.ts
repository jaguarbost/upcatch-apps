const PUBLIC_ORIGIN = 'https://www.upcatch.uk'
const NATIVE_SCHEME = 'uk.co.upcatch.app:'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseUpCatchAppLink(raw: string): string | null {
  let url: URL
  try { url = new URL(raw) } catch { return null }
  if (url.username || url.password || url.hash) return null
  if (url.protocol === NATIVE_SCHEME) {
    if (url.hostname !== 'app') return null
  } else if (url.origin !== PUBLIC_ORIGIN || url.pathname !== '/app') return null

  const view = url.protocol === NATIVE_SCHEME ? url.pathname.slice(1) : url.searchParams.get('view')
  if (view !== 'messages' && view !== 'meetups' && view !== 'wall' && view !== 'nudges') return null
  const params = new URLSearchParams({ view })
  if (view === 'messages') {
    const chat = url.searchParams.get('chat')
    if (chat === 'live') params.set('chat', 'live')
    else if (chat === 'scheduled') {
      const post = url.searchParams.get('post')
      if (!post || !UUID.test(post)) return null
      params.set('chat', 'scheduled')
      params.set('post', post)
    }
  }
  return '/app?' + params.toString()
}
