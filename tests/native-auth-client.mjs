import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile('lib/native/auth-client.ts', 'utf8')
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

function fixture(native, installed = true, platform = 'ios') {
  const calls = []
  let clientOptions
  let markerValue = installed ? 'installed' : null
  const marker = {
    getItem: key => { calls.push(['markerGet', key]); return markerValue },
    setItem: (key, value) => { calls.push(['markerSet', key, value]); markerValue = value },
  }
  const storage = {
    setKeyPrefix: async prefix => { calls.push(['prefix', prefix]) },
    setSynchronize: async sync => { calls.push(['sync', sync]) },
    setDefaultKeychainAccess: async access => { calls.push(['access', access]) },
    getItem: async key => { calls.push(['get', key]); return 'saved-session' },
    setItem: async (key, value) => { calls.push(['set', key, value]) },
    removeItem: async key => { calls.push(['remove', key]) },
  }
  const exports = {}
  new Function('require', 'exports', js)(name => {
    if (name === '@capacitor/core') return { Capacitor: { isNativePlatform: () => native, getPlatform: () => platform } }
    if (name === '@aparajita/capacitor-secure-storage') return { SecureStorage: storage, KeychainAccess: { whenUnlockedThisDeviceOnly: 1 } }
    if (name === '@supabase/supabase-js') return { createClient: (url, key, options) => {
      clientOptions = { url, key, options }
      calls.push(['createClient'])
      return { auth: {} }
    } }
    if (name === './storage-keys') return {
      NATIVE_SESSION_KEY: 'upcatch-native-session-v1', ACTIVE_MEMBER_KEY: 'active-member-v1', INSTALL_MARKER_KEY: 'upcatch:native-install-v1',
    }
    throw Error(`Unexpected import: ${name}`)
  }, exports)
  return { create: config => exports.createNativeAuthClient(config, marker), calls, options: () => clientOptions }
}

test('native auth never uses the plugin plaintext web fallback', async () => {
  const { create, calls } = fixture(false)
  await assert.rejects(create({ supabaseUrl: 'https://project.supabase.co', publishableKey: 'public' }), /installed app/)
  assert.deepEqual(calls, [])
})

test('native auth initializes device-only secure storage before Supabase restores a session', async () => {
  const { create, calls, options } = fixture(true)
  await create({ supabaseUrl: 'https://project.supabase.co', publishableKey: 'public' })
  assert.deepEqual(calls.slice(0, 5), [
    ['prefix', 'upcatch_auth_'], ['sync', false], ['access', 1],
    ['markerGet', 'upcatch:native-install-v1'], ['createClient'],
  ])
  const auth = options().options.auth
  assert.equal(auth.persistSession, true)
  assert.equal(auth.autoRefreshToken, true)
  assert.equal(auth.detectSessionInUrl, false)
  assert.equal(auth.flowType, 'pkce')
  assert.equal(await auth.storage.getItem('session-key'), 'saved-session')
  await auth.storage.setItem('session-key', 'new-session')
  await auth.storage.removeItem('session-key')
  assert.deepEqual(calls.slice(5), [['get', 'session-key'], ['set', 'session-key', 'new-session'], ['remove', 'session-key']])
})

test('a fresh install discards Keychain sessions left by an earlier installation', async () => {
  const { create, calls } = fixture(true, false)
  await create({ supabaseUrl: 'https://project.supabase.co', publishableKey: 'public' })
  assert.deepEqual(calls, [
    ['prefix', 'upcatch_auth_'], ['sync', false], ['access', 1],
    ['markerGet', 'upcatch:native-install-v1'],
    ['remove', 'upcatch-native-session-v1'], ['remove', 'active-member-v1'],
    ['markerSet', 'upcatch:native-install-v1', 'installed'], ['createClient'],
  ])
})

test('Android does not erase a secure session when WebView storage loses its install marker', async () => {
  const { create, calls } = fixture(true, false, 'android')
  await create({ supabaseUrl: 'https://project.supabase.co', publishableKey: 'public' })
  assert.deepEqual(calls, [
    ['prefix', 'upcatch_auth_'], ['sync', false], ['access', 1], ['createClient'],
  ])
})
