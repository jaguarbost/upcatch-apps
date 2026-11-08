import { MobileApi, MobileApiError } from '@/lib/native/api-client'

// The approved components call the existing web route names. Resolve those
// names through the bearer-authenticated mobile API without changing screens.
export function installNativeApiBridge(api: MobileApi) {
  const original = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input !== 'string' || !input.startsWith('/api/')) return original(input, init)
    try {
      const method = init?.method?.toUpperCase() || 'GET'
      let data: unknown
      if (input === '/api/notifications' && method === 'POST') data = await api.dispatchNotifications()
      else if (input === '/api/push' && method === 'GET') data = await api.push()
      else if (input === '/api/push' && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}')) as { enabled?: unknown }
        if (typeof body.enabled !== 'boolean') return Response.json({ error: 'Invalid preference.' }, { status: 400 })
        data = await api.setPushEnabled(body.enabled)
      } else return Response.json({ error: 'Unavailable.' }, { status: 404 })
      return Response.json(data, { headers: { 'Cache-Control': 'no-store' } })
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : 'Request failed.' }, {
        status: error instanceof MobileApiError ? error.status : 503,
      })
    }
  }
  return () => { window.fetch = original }
}

export function installPrivateImageBridge(api: MobileApi) {
  const objectUrls = new Map<HTMLImageElement, string>()
  const inFlight = new WeakMap<HTMLImageElement, string>()
  const release = (img: HTMLImageElement) => {
    const previous = objectUrls.get(img)
    if (previous) URL.revokeObjectURL(previous)
    objectUrls.delete(img)
  }
  const update = (img: HTMLImageElement) => {
    const source = img.getAttribute('src') || ''
    if (!source.startsWith('/api/member-photo?') && !source.startsWith('/api/friend-photo?') && !source.startsWith('/api/wall-photo?')) return
    if (inFlight.get(img) === source) return
    inFlight.set(img, source)
    const url = new URL(source, window.location.origin)
    const photo = url.pathname.endsWith('/member-photo')
      ? api.memberPhoto(url.searchParams.get('meetup') || '')
      : url.pathname.endsWith('/wall-photo')
        ? api.wallPhoto(url.searchParams.get('post') || '')
        : api.friendPhoto(url.searchParams.get('id') || '', url.searchParams.get('token') || undefined)
    void photo.then(blob => {
      inFlight.delete(img)
      if (!img.isConnected || img.getAttribute('src') !== source) return
      release(img)
      const objectUrl = URL.createObjectURL(blob)
      objectUrls.set(img, objectUrl)
      img.src = objectUrl
    }).catch(() => {
      inFlight.delete(img)
      if (img.isConnected && img.getAttribute('src') === source) img.src = '/placeholder-user.jpg'
    })
  }
  const scan = (node: Node) => {
    if (node instanceof HTMLImageElement) update(node)
    if (node instanceof Element) node.querySelectorAll('img').forEach(update)
  }
  scan(document.body)
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') scan(record.target)
      for (const node of record.addedNodes) scan(node)
      for (const node of record.removedNodes) {
        if (node instanceof HTMLImageElement) release(node)
        if (node instanceof Element) node.querySelectorAll('img').forEach(release)
      }
    }
  })
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] })
  return () => { observer.disconnect(); for (const image of objectUrls.keys()) release(image) }
}
