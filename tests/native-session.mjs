import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

async function load(file, dependencies) {
  const source = await readFile(file, 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  new Function('require', 'exports', js)(name => {
    if (name === 'server-only') return {}
    if (name in dependencies) return dependencies[name]
    throw new Error(`Unexpected import: ${name}`)
  }, exports)
  return exports
}

const member = { NativeAuthError: class NativeAuthError extends Error {
  constructor(status, message) { super(message); this.status = status }
} }
const api = await load('lib/server/native-api.ts', { './native-member': member })

test('session endpoint returns the verified member and private cache headers', async () => {
  const route = await load('app/api/mobile/session/route.ts', {
    '@/lib/server/native-api': api,
    '@/lib/server/native-member': { requireNativeMember: async () => ({
      user: { id: 'verified-member', email: 'member@example.com' },
      profile: { display_name: 'Member', onboarding_completed_at: '2026-10-01' },
    }) },
  })
  const response = await route.GET(new Request('https://api.example/mobile/session', { headers: { Origin: 'capacitor://localhost' } }))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'capacitor://localhost')
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
  assert.deepEqual(await response.json(), {
    memberId: 'verified-member', email: 'member@example.com', displayName: 'Member', onboardingComplete: true,
  })
})

test('session endpoint rejects foreign origins before member lookup', async () => {
  let called = false
  const route = await load('app/api/mobile/session/route.ts', {
    '@/lib/server/native-api': api,
    '@/lib/server/native-member': { requireNativeMember: async () => { called = true } },
  })
  const response = await route.GET(new Request('https://api.example/mobile/session', { headers: { Origin: 'https://foreign.example' } }))
  assert.equal(response.status, 403)
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null)
  assert.equal(called, false)
})

test('session preflight allows only the Capacitor origin and GET', async () => {
  const allowed = api.nativePreflight(new Request('https://api.example/mobile/session', {
    method: 'OPTIONS', headers: { Origin: 'http://localhost', 'Access-Control-Request-Method': 'GET' },
  }), 'GET')
  assert.equal(allowed.status, 204)
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), 'http://localhost')
  const rejected = api.nativePreflight(new Request('https://api.example/mobile/session', {
    method: 'OPTIONS', headers: { Origin: 'http://localhost', 'Access-Control-Request-Method': 'POST' },
  }), 'GET')
  assert.equal(rejected.status, 403)
})
