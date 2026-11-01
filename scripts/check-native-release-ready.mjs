import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import './check-native-metadata.mjs'

if (process.env.CAPACITOR_SERVER_URL) throw new Error('Unset CAPACITOR_SERVER_URL before preparing a release.')
const root = new URL('..', import.meta.url)
const read = path => readFile(new URL(path, root), 'utf8')
const [entry, androidConfig, iosConfig] = await Promise.all([
  read('capacitor-web/index.html'),
  read('android/app/src/main/assets/capacitor.config.json'),
  read('ios/App/App/capacitor.config.json'),
])
assert.ok(!entry.includes('Set CAPACITOR_SERVER_URL'), 'The bundled client is still a setup placeholder.')
const script = entry.match(/<script\b[^>]*\bsrc="([^"]+)"/i)?.[1]
assert.ok(script, 'The release bundle has no client script.')
assert.ok(script.startsWith('/assets/') && !script.includes('..'), 'The release script must be bundled locally from the app root.')
await read(`capacitor-web${script}`)
const stylesheet = entry.match(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"/i)?.[1]
assert.ok(stylesheet?.startsWith('/assets/') && !stylesheet.includes('..'), 'The release stylesheet must be bundled locally from the app root.')
await read(`capacitor-web${stylesheet}`)
const privateNames = [
  'SUPABASE_SECRET_KEY', 'ONESIGNAL_API_KEY', 'ONESIGNAL_ALIAS_SECRET',
  'RESEND_API_KEY', 'CRON_SECRET',
]
const localEnv = await read('.env.local').catch(() => '')
const localValues = new Map([...localEnv.matchAll(/^([A-Z][A-Z0-9_]*)=(.*)$/gm)].map(([, name, raw]) => [name, raw.trim().replace(/^(['"])(.*)\1$/, '$2')]))
const privateValues = privateNames.map(name => [name, process.env[name] || localValues.get(name)]).filter(([, value]) => value && value.length >= 16)
for (const [secretName, secret] of privateValues)
  assert.ok(!entry.includes(secret), `${secretName} appears in the packaged client.`)
const assetNames = await readdir(new URL('assets/', new URL('capacitor-web/', root)))
for (const name of assetNames.filter(name => /\.(?:js|css)$/.test(name))) {
  const content = await read(`capacitor-web/assets/${name}`)
  for (const [secretName, secret] of privateValues)
    assert.ok(!content.includes(secret), `${secretName} appears in the packaged client.`)
}
for (const [platform, path] of [
  ['Android', 'android/app/src/main/assets/public/'],
  ['iOS', 'ios/App/App/public/'],
]) {
  assert.equal(await read(`${path}index.html`), entry, `${platform} contains a stale client bundle. Run pnpm native:sync.`)
  await read(`${path}${script.slice(1)}`)
  await read(`${path}${stylesheet.slice(1)}`)
}
for (const [platform, source] of [['Android', androidConfig], ['iOS', iosConfig]]) {
  const config = JSON.parse(source)
  assert.ok(!config.server?.url, `${platform} release config contains a remote WebView URL.`)
  assert.equal(config.appId, 'uk.co.upcatch.app', `${platform} app ID differs from the release identifier.`)
}
console.log('Native release bundle has a client entry and no remote WebView URL; verify /start offline on device')
