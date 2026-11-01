import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile('lib/native/session-manager.ts', 'utf8')
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
class MobileApiError extends Error {
  constructor(status, message) { super(message); this.status = status }
}
const exports = {}
new Function('require', 'exports', js)(name => {
  if (name === './api-client') return { MobileApiError }
  if (name === './storage-keys') return { ACTIVE_MEMBER_KEY: 'active-member-v1' }
  throw Error(`Unexpected import: ${name}`)
}, exports)

function fixture({ storedId = null, sessionId = 'member-a', verifiedId = sessionId, apiError = null } = {}) {
  const calls = []
  let stored = storedId
  let authSession = sessionId ? { user: { id: sessionId } } : null
  const auth = {
    getSession: async () => ({ data: { session: authSession }, error: null }),
    signInWithPassword: async ({ email }) => {
      calls.push(['signIn', email])
      authSession = { user: { id: 'member-b' } }
      return { error: null }
    },
    signOut: async ({ scope }) => {
      calls.push(['signOut', scope])
      authSession = null
      return { error: null }
    },
  }
  const api = { session: async () => {
    calls.push(['verify'])
    if (apiError) throw apiError
    return { memberId: verifiedId, email: 'member@example.com', displayName: 'Member', onboardingComplete: true }
  } }
  const storage = {
    getItem: async () => stored,
    setItem: async (_, id) => { calls.push(['store', id]); stored = id },
    removeItem: async () => { calls.push(['remove']); stored = null },
  }
  const manager = new exports.NativeSessionManager(auth, api, storage,
    async () => { calls.push(['detachPush']) },
    async () => { calls.push(['clearState']) })
  return { manager, calls, stored: () => stored, setVerified: id => { verifiedId = id } }
}

test('restoration verifies the backend identity and retains a matching push binding', async () => {
  const { manager, calls } = fixture({ storedId: 'member-a' })
  assert.equal((await manager.restore()).memberId, 'member-a')
  assert.deepEqual(calls, [['verify'], ['store', 'member-a']])
})

test('cold account change clears the former push identity and private state before accepting the new account', async () => {
  const { manager, calls, stored } = fixture({ storedId: 'member-a', sessionId: 'member-b', verifiedId: 'member-b' })
  assert.equal((await manager.restore()).memberId, 'member-b')
  assert.deepEqual(calls, [['verify'], ['detachPush'], ['clearState'], ['store', 'member-b']])
  assert.equal(stored(), 'member-b')
})

test('switching accounts signs out locally and clears the old account before new sign-in', async () => {
  const { manager, calls, setVerified } = fixture({ storedId: 'member-a' })
  setVerified('member-b')
  assert.equal((await manager.signInWithPassword('new@example.com', 'password')).memberId, 'member-b')
  assert.deepEqual(calls, [
    ['detachPush'], ['signOut', 'local'], ['remove'], ['clearState'],
    ['signIn', 'new@example.com'], ['verify'], ['store', 'member-b'],
  ])
})

test('invalid credentials clear native auth; account restrictions and outages preserve it for retry', async () => {
  const invalid = fixture({ storedId: 'member-a', apiError: new MobileApiError(401, 'Sign in') })
  await assert.rejects(invalid.manager.restore(), error => error.status === 401)
  assert.deepEqual(invalid.calls, [['verify'], ['detachPush'], ['signOut', 'local'], ['remove'], ['clearState']])
  const denied = fixture({ storedId: 'member-a', apiError: new MobileApiError(403, 'Confirm email') })
  await assert.rejects(denied.manager.restore(), error => error.status === 403)
  assert.deepEqual(denied.calls, [['verify']])
  const outage = fixture({ storedId: 'member-a', apiError: new MobileApiError(503, 'Unavailable') })
  await assert.rejects(outage.manager.restore(), error => error.status === 503)
  assert.deepEqual(outage.calls, [['verify']])
})

test('an expired local session clears an old push binding and private state', async () => {
  const { manager, calls, stored } = fixture({ storedId: 'member-a', sessionId: null })
  assert.equal(await manager.restore(), null)
  assert.deepEqual(calls, [['detachPush'], ['remove'], ['clearState']])
  assert.equal(stored(), null)
})
