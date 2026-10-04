import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const token = 'header.payload.signature'
async function fixture(options = {}) {
  const calls = []
  const user = { id: 'verified-member', email_confirmed_at: options.unconfirmed ? null : '2026-10-01T00:00:00Z' }
  const supabase = {
    auth: { getUser: async supplied => {
      calls.push(['getUser', supplied])
      return options.authError ? { data: { user: null }, error: options.authError } : { data: { user }, error: null }
    } },
    rpc: async name => { calls.push(['rpc', name]); return { data: { allowed: options.allowed !== false }, error: null } },
    from: name => {
      calls.push(['from', name])
      return { select: () => ({ eq: (column, value) => {
        calls.push(['eq', column, value])
        return { maybeSingle: async () => ({ data: { id: value }, error: null }) }
      } }) }
    },
  }
  const source = await readFile('lib/server/native-member.ts', 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  new Function('require', 'exports', js)(name => {
    if (name === 'server-only') return {}
    if (name === '@supabase/supabase-js') return { createClient: (url, key, config) => {
      calls.push(['createClient', url, key, config.global.headers.Authorization])
      return supabase
    } }
    if (name === '@/lib/supabase/config') return { supabaseConfig: () => ({ url: 'https://supabase.invalid', key: 'publishable' }) }
    throw new Error('Unexpected import ' + name)
  }, exports)
  return { api: exports, calls }
}

test('native auth rejects missing bearer tokens without creating a client', async () => {
  const { api, calls } = await fixture()
  await assert.rejects(api.requireNativeMember(new Request('https://upcatch.example/api/mobile/bootstrap')), error => error.status === 401)
  assert.deepEqual(calls, [])
})

test('native auth verifies the token and scopes profile access to its user', async () => {
  const { api, calls } = await fixture()
  const request = new Request('https://upcatch.example/api/mobile/bootstrap', { headers: { Authorization: `Bearer ${token}`, 'X-User-Id': 'attacker' } })
  const result = await api.requireNativeMember(request)
  assert.equal(result.user.id, 'verified-member')
  assert.deepEqual(calls[0], ['createClient', 'https://supabase.invalid', 'publishable', `Bearer ${token}`])
  assert.deepEqual(calls[1], ['getUser', token])
  assert.ok(calls.some(call => call[0] === 'eq' && call[2] === 'verified-member'))
  assert.ok(!calls.some(call => call.includes('attacker')))
})

test('native auth denies unconfirmed and ineligible members', async () => {
  const unconfirmed = await fixture({ unconfirmed: true })
  await assert.rejects(unconfirmed.api.requireNativeMember(new Request('https://upcatch.example/', { headers: { Authorization: `Bearer ${token}` } })), error => error.status === 403)
  assert.ok(!unconfirmed.calls.some(call => call[0] === 'rpc'))
  const ineligible = await fixture({ allowed: false })
  await assert.rejects(ineligible.api.requireNativeMember(new Request('https://upcatch.example/', { headers: { Authorization: `Bearer ${token}` } })), error => error.status === 403)
  assert.ok(!ineligible.calls.some(call => call[0] === 'from'))
})

test('native auth treats a provider outage as temporary rather than invalid credentials', async () => {
  const { api } = await fixture({ authError: { name: 'AuthRetryableFetchError', status: 503 } })
  await assert.rejects(api.requireNativeMember(new Request('https://upcatch.example/', { headers: { Authorization: `Bearer ${token}` } })), error => error.status === 503)
})
