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

test('stalled mobile requests abort at a deadline and can be retried', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const auth = { getSession: async () => ({ data: { session: session('member-a', 'token-a') }, error: null }) }
  let signal, calls = 0
  const client = new api.MobileApi('https://api.example', auth, async (_, init) => {
    if (++calls > 1) return Response.json({ memberId: 'member-a' })
    signal = init.signal
    return new Promise(() => {})
  })
  const failed = assert.rejects(client.bootstrap(), error => error.status === 0 && /too long/.test(error.message))
  await new Promise(setImmediate)
  t.mock.timers.tick(15000)
  await failed
  assert.equal(signal.aborted, true)
  assert.equal((await client.session()).memberId, 'member-a')
})

test('photo uploads get a longer deadline and explain that a timed-out upload may already be saved', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const auth = { getSession: async () => ({ data: { session: session('member-a', 'token-a') }, error: null }) }
  let signal
  const client = new api.MobileApi('https://api.example', auth, async (_, init) => {
    signal = init.signal
    return new Promise(() => {})
  })
  const failed = assert.rejects(client.uploadPhoto(new File(['photo'], 'photo.jpg')), /may already be saved/)
  await new Promise(setImmediate)
  t.mock.timers.tick(15000)
  assert.equal(signal.aborted, false)
  t.mock.timers.tick(30000)
  await failed
  assert.equal(signal.aborted, true)
})

test('photo replacement sends authenticated multipart photo to the mobile endpoint', async () => {
  const auth = { getSession: async () => ({ data: { session: session('member-a', 'token-a') }, error: null }) }
  const client = new api.MobileApi('https://api.example', auth, async (url, init) => {
    assert.equal(url, 'https://api.example/api/mobile/profile-photo')
    assert.equal(init.method, 'POST')
    assert.equal(init.headers.get('Authorization'), 'Bearer token-a')
    assert.equal(init.headers.has('Content-Type'), false, 'fetch supplies multipart boundary')
    assert.equal(await init.body.get('photo').text(), 'photo-bytes')
    return Response.json({ message: 'Saved' })
  })
  assert.deepEqual(await client.uploadPhoto(new File(['photo-bytes'], 'profile.jpg', { type: 'image/jpeg' })), { message: 'Saved' })
})

test('onboarding photo explicitly opts into version 2 while about sends only bio and interests with bearer auth', async () => {
  const auth = { getSession: async () => ({ data: { session: session('member-a', 'token-a') }, error: null }) }
  const bodies = []
  const client = new api.MobileApi('https://api.example', auth, async (url, init) => {
    assert.equal(init.headers.get('Authorization'), 'Bearer token-a')
    if (url.endsWith('/profile-photo')) {
      assert.equal(init.body.get('onboardingVersion'), '2')
      return Response.json({ photoSaved: true, nextStep: 'about', message: 'Saved' })
    }
    assert.equal(url, 'https://api.example/api/mobile/onboarding/about')
    assert.equal(init.headers.get('Content-Type'), 'application/json')
    bodies.push(JSON.parse(init.body))
    return Response.json({ completed: true })
  })
  await client.uploadPhoto(new File(['photo'], 'photo.jpg'), 2)
  await client.saveOnboardingAbout('Hello', ['Coffee', 'Books', 'Music'])
  assert.deepEqual(bodies, [{ bio: 'Hello', interests: ['Coffee', 'Books', 'Music'] }])
})

test('HTTP 202 cannot complete introduction even if the body claims completion', async () => {
  const auth = { getSession: async () => ({ data: { session: session('member-a', 'token-a') }, error: null }) }
  const client = new api.MobileApi('https://api.example', auth, async () => Response.json({ completed: true }, { status: 202 }))
  await assert.rejects(client.saveOnboardingAbout('Hello', ['Coffee', 'Books', 'Music']), /not confirmed/)
})

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
