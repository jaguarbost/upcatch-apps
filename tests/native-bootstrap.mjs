import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile('lib/server/live-bootstrap.ts', 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const exports = {}
new Function('require', 'exports', js)(name => {
  if (name === 'server-only') return {}
  throw new Error(`Unexpected import: ${name}`)
}, exports)

test('shared bootstrap uses the authenticated profile city and returns the existing app shape', async () => {
  const calls = []
  const city = { id: 'home-city', name: 'Manchester', latitude: 53.48, longitude: -2.24, timezone: 'Europe/London' }
  const venue = { id: 'venue-1', name: 'Cafe', address: 'Main St', latitude: 53.49, longitude: -2.25, status: 'approved' }
  const supabase = {
    from(table) {
      calls.push(['from', table])
      const query = {
        select() { return this },
        eq(column, value) { calls.push(['eq', table, column, value]); return this },
        in() { return this },
        single: async () => ({ data: city, error: null }),
        maybeSingle: async () => ({ data: { push_enabled: true }, error: null }),
        order: async () => ({ data: [venue], error: null }),
      }
      return query
    },
    rpc: async name => ({ data: name === 'my_meetup_access' ? [{ id_status: 'approved', completed_meetups: 2 }] : true, error: null }),
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://photos.example/signed' }, error: null }) }) },
  }
  const result = await exports.loadLiveBootstrap(supabase, {
    id: 'verified-member', display_name: 'Member', photo_path: 'verified-member/photo.jpg',
    home_city_id: 'home-city', onboarding_completed_at: '2026-10-01',
  })
  assert.equal(result.memberId, 'verified-member')
  assert.equal(result.cityId, 'home-city')
  assert.equal(result.completed, true)
  assert.equal(result.pushEnabled, true)
  assert.equal(result.photo, 'https://photos.example/signed')
  assert.equal(result.venues[0].id, 'venue-1')
  assert.deepEqual(result.venues[0].position, [53.49, -2.25])
  assert.ok(calls.some(call => call.join(':') === 'eq:cities:id:home-city'))
  assert.ok(calls.some(call => call.join(':') === 'eq:venues:city_id:home-city'))
  assert.ok(calls.some(call => call.join(':') === 'eq:notification_preferences:user_id:verified-member'))
})
