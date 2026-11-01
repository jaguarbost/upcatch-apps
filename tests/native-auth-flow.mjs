import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile('lib/native/auth-flow.ts', 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText

function fixture(provider = 'google') {
  const values = new Map(), calls = []
  let accepted = false
  const store = {
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value) },
    removeItem: async key => { values.delete(key) },
  }
  const auth = {
    signUp: async options => { calls.push(['signup', options]); return { data: { session: null }, error: null } },
    resend: async options => { calls.push(['resend', options]); return { error: null } },
    resetPasswordForEmail: async (email, options) => { calls.push(['reset', email, options]); return { error: null } },
    signInWithOAuth: async options => { calls.push(['google', options]); return { data: { url: 'https://example.supabase.co/auth/v1/authorize' }, error: null } },
    updateUser: async options => { calls.push(['terms', options]); accepted = true; return { error: null } },
    getUser: async () => ({ data: { user: { app_metadata: { provider }, user_metadata: accepted ? { terms_version: '2026-09-29' } : {} } }, error: null }),
  }
  const session = { current: () => null, restore: async () => { calls.push(['restore']) } }
  const links = {
    NATIVE_AUTH_CALLBACK: 'uk.co.upcatch.app://auth/callback',
    listenForNativeAuthReturns: async () => () => {},
    openNativeAuthBrowser: async url => { calls.push(['browser', url]) },
    exchangeNativeAuthCode: async (_auth, result) => result.destination,
    confirmNativeEmail: async (_auth, result) => result.type === 'recovery' ? '/auth/reset-password' : '/start',
  }
  const exports = {}
  new Function('require', 'exports', js)(name => {
    if (name === './return-links') return links
    throw Error('Unexpected import ' + name)
  }, exports)
  return { flow: new exports.NativeAuthFlow(auth, session, store), calls, values }
}

test('native signup and recovery use the app callback', async () => {
  const { flow, calls } = fixture()
  await assert.rejects(flow.signUp('a@example.com', 'long-password', false), /accept the Terms/)
  await flow.signUp('a@example.com', 'long-password', true)
  await flow.resendConfirmation('a@example.com')
  await flow.requestPasswordReset('a@example.com')
  assert.equal(calls[0][1].options.emailRedirectTo, 'uk.co.upcatch.app://auth/callback')
  assert.equal(calls[1][1].options.emailRedirectTo, 'uk.co.upcatch.app://auth/callback')
  assert.equal(calls[2][2].redirectTo, 'uk.co.upcatch.app://auth/callback?next=reset')
})

test('Google terms choice survives a cold return and recovery cannot consume it', async () => {
  const { flow, calls, values } = fixture()
  await flow.startGoogle(true)
  assert.equal(calls[0][1].options.skipBrowserRedirect, true)
  assert.equal(calls[1][0], 'browser')
  const result = await flow.finishCode({ kind: 'code', code: 'test-code', destination: '/start' })
  assert.deepEqual(result, { kind: 'route', path: '/start' })
  assert.equal(calls.filter(call => call[0] === 'terms').length, 1)
  assert.equal(values.size, 0)

  const second = fixture()
  await second.flow.startGoogle(true)
  await second.flow.finishCode({ kind: 'code', code: 'reset-code', destination: '/auth/reset-password' })
  assert.equal(second.calls.filter(call => call[0] === 'terms').length, 0)

  const emailReturn = fixture('email')
  await emailReturn.flow.startGoogle(true)
  assert.deepEqual(await emailReturn.flow.finishCode({ kind: 'code', code: 'email-code', destination: '/start' }), { kind: 'needs-terms' })
  assert.equal(emailReturn.calls.filter(call => call[0] === 'terms').length, 0)
})

test('email token requires a confirmation action', async () => {
  const { flow, calls } = fixture()
  const link = { kind: 'confirmation', tokenHash: 'abcdefghijklmnop', type: 'signup' }
  await assert.rejects(flow.confirmEmail(link, false), /Confirm this link/)
  assert.equal(calls.length, 0)
  assert.deepEqual(await flow.confirmEmail(link, true), { kind: 'route', path: '/start' })
  assert.equal(calls.filter(call => call[0] === 'restore').length, 1)
})
