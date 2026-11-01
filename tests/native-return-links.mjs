import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile('lib/native/return-links.ts', 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
let listener
const app = {
  addListener: async (_name, callback) => { listener = callback; return { remove: async () => {} } },
  getLaunchUrl: async () => ({ url: 'uk.co.upcatch.app://auth/callback?code=valid_code123' }),
}
const browser = { open: async () => {} }
const exports = {}
new Function('require', 'exports', js)(name => {
  if (name === '@capacitor/app') return { App: app }
  if (name === '@capacitor/browser') return { Browser: browser }
  throw Error('Unexpected import ' + name)
}, exports)
const { parseNativeAuthReturn, listenForNativeAuthReturns, confirmNativeEmail, openNativeAuthBrowser } = exports

test('only the registered auth callback accepts credentials', () => {
  assert.deepEqual(parseNativeAuthReturn('uk.co.upcatch.app://auth/callback?code=valid_code123'), { kind: 'code', code: 'valid_code123', destination: '/start' })
  assert.equal(parseNativeAuthReturn('https://evil.example/auth/callback?code=valid_code123'), null)
  assert.equal(parseNativeAuthReturn('uk.co.upcatch.app://evil/callback?code=valid_code123'), null)
  assert.equal(parseNativeAuthReturn('uk.co.upcatch.app://auth/other?code=valid_code123'), null)
  assert.equal(parseNativeAuthReturn('uk.co.upcatch.app://auth/callback?code=abc&token_hash=abcdefghijklmnop&type=signup'), null)
  assert.equal(parseNativeAuthReturn('uk.co.upcatch.app://auth/callback?token_hash=x&type=signup'), null)
})

test('recovery and confirmation links route to the correct flow', () => {
  assert.deepEqual(parseNativeAuthReturn('uk.co.upcatch.app://auth/callback?code=valid_code123&next=reset'), { kind: 'code', code: 'valid_code123', destination: '/auth/reset-password' })
  assert.deepEqual(parseNativeAuthReturn('uk.co.upcatch.app://auth/callback?token_hash=abcdefghijklmnop&type=recovery'), { kind: 'confirmation', tokenHash: 'abcdefghijklmnop', type: 'recovery' })
  assert.deepEqual(parseNativeAuthReturn('uk.co.upcatch.app://auth/callback?error=access_denied'), { kind: 'error' })
})

test('cold and warm delivery of the same URL is handled once', async () => {
  const received = []
  const stop = await listenForNativeAuthReturns(result => received.push(result))
  listener({ url: 'uk.co.upcatch.app://auth/callback?code=valid_code123' })
  listener({ url: 'uk.co.upcatch.app://auth/callback?code=another_code123' })
  assert.equal(received.length, 2)
  await stop()
})

test('token hash is consumed only by an explicit confirmation call', async () => {
  let calls = 0
  const result = parseNativeAuthReturn('uk.co.upcatch.app://auth/callback?token_hash=abcdefghijklmnop&type=recovery')
  assert.equal(calls, 0)
  const destination = await confirmNativeEmail({ verifyOtp: async () => { calls++; return { error: null } } }, result)
  assert.equal(calls, 1)
  assert.equal(destination, '/auth/reset-password')
  await assert.rejects(openNativeAuthBrowser('http://example.com'), /HTTPS/)
})
