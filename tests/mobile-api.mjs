import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile('lib/native/api-client.ts', 'utf8')
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const api = {}
new Function('require', 'exports', js)(name => { throw Error(`Unexpected import: ${name}`) }, api)

function session(id, token) { return { user: { id }, access_token: token } }

test('mobile API calls the browser fetch with its global receiver', async () => {
  const originalFetch = globalThis.fetch
  const auth = {
    getSession: async () => ({ data: { session: session('member-a', 'token-a') }, error: null }),
    refreshSession: async () => { throw Error('Unexpected refresh') },
  }
  try {
    globalThis.fetch = function () {
      assert.equal(this, globalThis)
      return Promise.resolve(Response.json({ memberId: 'member-a' }))
    }
    const client = new api.MobileApi('https://api.example', auth)
    assert.deepEqual(await client.session(), { memberId: 'member-a' })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('mobile API sends a bearer token to the fixed HTTPS origin', async () => {
  const calls = []
  const auth = { getSession: async () => ({ data: { session: session('member-a', 'token-a') }, error: null }), refreshSession: async () => { throw Error('Unexpected refresh') } }
  const client = new api.MobileApi('https://api.example', auth, async (url, init) => {
    calls.push([url, init.headers.get('Authorization'), init.cache])
    return Response.json({ memberId: 'member-a' })
  })
  assert.deepEqual(await client.session(), { memberId: 'member-a' })
  assert.deepEqual(calls, [['https://api.example/api/mobile/session', 'Bearer token-a', 'no-store']])
  assert.throws(() => new api.MobileApi('http://api.example', auth), /HTTPS origin/)
})

test('mobile API refreshes once on 401 and retries with the same member identity', async () => {
  let current = session('member-a', 'expired')
  let refreshes = 0
  const tokens = []
  const auth = {
    getSession: async () => ({ data: { session: current }, error: null }),
    refreshSession: async () => {
      refreshes++
      current = session('member-a', 'fresh')
      return { data: { session: current }, error: null }
    },
  }
  const client = new api.MobileApi('https://api.example', auth, async (_, init) => {
    tokens.push(init.headers.get('Authorization'))
    return tokens.length === 1 ? Response.json({ error: 'Sign in to continue.' }, { status: 401 }) : Response.json({ memberId: 'member-a' })
  })
  assert.equal((await client.session()).memberId, 'member-a')
  assert.deepEqual(tokens, ['Bearer expired', 'Bearer fresh'])
  assert.equal(refreshes, 1)
})

test('mobile API discards an in-flight response after account switching', async () => {
  let current = session('member-a', 'token-a')
  const auth = { getSession: async () => ({ data: { session: current }, error: null }), refreshSession: async () => { throw Error('Unexpected refresh') } }
  const client = new api.MobileApi('https://api.example', auth, async () => {
    current = session('member-b', 'token-b')
    return Response.json({ memberId: 'member-a', private: 'member-a-data' })
  })
  await assert.rejects(client.session(), error => error instanceof api.MobileAccountChangedError)
})

test('mobile API reports failed refresh as sign-in required', async () => {
  const auth = {
    getSession: async () => ({ data: { session: session('member-a', 'expired') }, error: null }),
    refreshSession: async () => ({ data: { session: null }, error: Error('expired') }),
  }
  const client = new api.MobileApi('https://api.example', auth, async () => Response.json({ error: 'Sign in' }, { status: 401 }))
  await assert.rejects(client.bootstrap(), error => error instanceof api.MobileApiError && error.status === 401)
})
