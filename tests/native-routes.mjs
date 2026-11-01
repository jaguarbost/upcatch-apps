import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

async function load(file, dependencies) {
  const source = await readFile(file, 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  new Function('require', 'exports', js)(name => {
    if (name === 'server-only') return {}
    if (name in dependencies) return dependencies[name]
    throw new Error(`Unexpected import: ${name}`)
  }, exports)
  return exports
}

const NativeAuthError = class extends Error {
  constructor(status, message) { super(message); this.status = status }
}
const api = await load('lib/server/native-api.ts', { './native-member': { NativeAuthError } })
const origin = { Origin: 'capacitor://localhost' }
const memberId = 'verified-member'

test('mobile upload passes only the verified member ID to the shared photo service', async () => {
  const calls = []
  const route = await load('app/api/mobile/profile-photo/route.ts', {
    '@/lib/server/native-api': api,
    '@/lib/server/native-member': { requireNativeMember: async () => ({ user: { id: memberId } }) },
    '@/lib/server/profile-photo': { saveProfilePhoto: async (id, file) => {
      calls.push({ id, name: file.name })
      return { status: 200, message: 'Photo saved.' }
    } },
  })
  const form = new FormData()
  form.set('photo', new File(['jpeg'], 'face.jpg', { type: 'image/jpeg' }))
  form.set('user_id', 'attacker')
  const response = await route.POST(new Request('https://api.example/api/mobile/profile-photo', {
    method: 'POST', headers: origin, body: form,
  }))
  assert.equal(response.status, 200)
  assert.deepEqual(calls, [{ id: memberId, name: 'face.jpg' }])
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
})

test('mobile upload rejects a foreign origin before authenticating or reading a body', async () => {
  let authenticated = false
  const route = await load('app/api/mobile/profile-photo/route.ts', {
    '@/lib/server/native-api': api,
    '@/lib/server/native-member': { requireNativeMember: async () => { authenticated = true } },
    '@/lib/server/profile-photo': { saveProfilePhoto: async () => { throw Error('Unexpected upload') } },
  })
  const response = await route.POST(new Request('https://api.example/api/mobile/profile-photo', {
    method: 'POST', headers: { Origin: 'https://foreign.example' }, body: 'untrusted',
  }))
  assert.equal(response.status, 403)
  assert.equal(authenticated, false)
})

test('member photo checks participant access before private Storage', async () => {
  let adminCalled = false
  const route = await load('app/api/mobile/member-photo/route.ts', {
    '@/lib/server/native-api': api,
    '@/lib/server/native-member': { requireNativeMember: async () => ({
      user: { id: memberId }, supabase: { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }) },
    }) },
    '@/lib/supabase/admin': { adminClient: () => { adminCalled = true } },
  })
  const response = await route.GET(new Request('https://api.example/api/mobile/member-photo?meetup=00000000-0000-0000-0000-000000000001', { headers: origin }))
  assert.equal(response.status, 404)
  assert.equal(adminCalled, false)
})

test('friend photo uses the member-scoped QR authorization result as its only Storage path', async () => {
  const calls = []
  const path = `${memberId}/allowed.jpg`
  const route = await load('app/api/mobile/friend-photo/route.ts', {
    '@/lib/server/native-api': api,
    '@/lib/server/native-member': { requireNativeMember: async () => ({ supabase: {
      rpc: async (name, args) => { calls.push([name, args]); return { data: path, error: null } },
    } }) },
    '@/lib/supabase/admin': { adminClient: () => ({ storage: { from: bucket => {
      calls.push(['bucket', bucket])
      return { download: async value => {
        calls.push(['download', value])
        return { data: new Blob(['jpeg']), error: null }
      } }
    } } }) },
  })
  const id = '00000000-0000-0000-0000-000000000001'
  const response = await route.GET(new Request(`https://api.example/api/mobile/friend-photo?id=${id}`, { headers: origin }))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Content-Type'), 'image/jpeg')
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
  assert.deepEqual(calls, [
    ['qr_friend_photo_path', { p_user: id, p_token: null }],
    ['bucket', 'profile-photos'], ['download', path],
  ])
})

test('push preference is written through the verified member client', async () => {
  const calls = []
  const route = await load('app/api/mobile/push/route.ts', {
    'next/server': { after: () => { throw Error('Unexpected delivery') } },
    '@/lib/server/native-api': api,
    '@/lib/server/native-member': { requireNativeMember: async () => ({
      user: { id: memberId }, supabase: { rpc: async (name, args) => {
        calls.push([name, args]); return { error: null }
      } },
    }) },
    '@/lib/server/notifications': { pushAlias: () => { throw Error('Unexpected alias') }, deliverNotifications: () => { throw Error('Unexpected delivery') } },
  })
  const response = await route.POST(new Request('https://api.example/api/mobile/push', {
    method: 'POST', headers: { ...origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: false, user_id: 'attacker' }),
  }))
  assert.equal(response.status, 200)
  assert.deepEqual(calls, [['set_push_preference', { p_enabled: false }]])
})
