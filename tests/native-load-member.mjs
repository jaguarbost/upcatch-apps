import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const compiled = ts.transpileModule(await readFile('native-client/load-member.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const exports = {}
new Function('exports', compiled)(exports)

test('startup runs independent identity checks together and waits for both before bootstrap', async () => {
  const calls = []
  let restore, user
  const initial = { memberId: 'member-a', completed: true }
  const result = exports.loadNativeMember({
    session: { restore: () => { calls.push('restore'); return new Promise(resolve => { restore = resolve }) } },
    supabase: { auth: { getUser: () => { calls.push('getUser'); return new Promise(resolve => { user = resolve }) } } },
    api: { bootstrap: async () => { calls.push('bootstrap'); return initial } },
  })
  assert.deepEqual(calls, ['restore', 'getUser'])
  restore({ memberId: 'member-a' })
  await new Promise(setImmediate)
  assert.equal(calls.includes('bootstrap'), false)
  user({ data: { user: { id: 'member-a', user_metadata: { terms_version: 'accepted' } } } })
  assert.deepEqual(await result, { kind: 'ready', initial })
})

test('startup keeps terms and account identity gates before private bootstrap', async () => {
  const fixture = (member, user) => ({ session: { restore: async () => member }, supabase: { auth: { getUser: async () => ({ data: { user } }) } }, api: { bootstrap: () => { throw Error('Must not bootstrap') } } })
  assert.deepEqual(await exports.loadNativeMember(fixture(null, null)), { kind: 'anonymous' })
  assert.deepEqual(await exports.loadNativeMember(fixture({ memberId: 'a' }, { id: 'a' })), { kind: 'terms' })
  await assert.rejects(exports.loadNativeMember(fixture({ memberId: 'a' }, { id: 'b' })), /sign-in could not be checked/)
})

test('pending about data routes back to onboarding; completed existing accounts remain completed', async () => {
  const load = initial => exports.loadNativeMember({ session: { restore: async () => ({ memberId: 'a' }) }, supabase: { auth: { getUser: async () => ({ data: { user: { id: 'a', user_metadata: { terms_version: 'accepted' } } } }) } }, api: { bootstrap: async () => initial } })
  const pending = await load({ memberId: 'a', completed: true, photoSaved: true, aboutPending: true })
  assert.equal(pending.initial.completed, false)
  const existing = await load({ memberId: 'a', completed: true, photoSaved: true, aboutPending: false })
  assert.equal(existing.initial.completed, true)
})
