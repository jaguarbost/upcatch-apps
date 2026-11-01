import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile('lib/server/profile-photo.ts', 'utf8')
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

function fixture(finalizeError = null) {
  const calls = []
  const admin = {
    rpc: async (name, args) => {
      calls.push([name, args])
      if (name === 'reserve_photo_upload') return { data: true, error: null }
      return { error: finalizeError }
    },
    storage: { from: bucket => {
      calls.push(['bucket', bucket])
      return {
        upload: async (path, bytes, options) => {
          calls.push(['upload', path, bytes.toString(), options])
          return { error: null }
        },
        remove: async paths => { calls.push(['remove', paths]); return { error: null } },
      }
    } },
  }
  const exports = {}
  new Function('require', 'exports', js)(name => {
    if (name === 'server-only') return {}
    if (name === 'node:crypto') return { randomUUID: () => 'photo-id' }
    if (name === '@/lib/supabase/admin') return { adminClient: () => admin }
    if (name === './image') return { MAX_PHOTO_BYTES: 5 * 1024 * 1024, normalizePhoto: async () => Buffer.from('normalized') }
    if (name === './notifications') return { deliverNotifications: async id => { calls.push(['deliver', id]) } }
    throw new Error(`Unexpected import: ${name}`)
  }, exports)
  return { saveProfilePhoto: exports.saveProfilePhoto, calls }
}

test('shared photo upload stores only normalized bytes under the verified member path', async () => {
  const { saveProfilePhoto, calls } = fixture()
  const result = await saveProfilePhoto('verified-member', new File(['raw'], 'photo.png'))
  assert.equal(result.status, 200)
  assert.ok(calls.some(call => call[0] === 'upload' && call[1] === 'verified-member/photo-id.jpg' && call[2] === 'normalized'))
  assert.ok(calls.some(call => call[0] === 'finalize_profile_photo' && call[1].p_user === 'verified-member'))
  assert.deepEqual(calls.at(-1), ['deliver', 'verified-member'])
})

test('shared photo upload removes private bytes when profile finalization fails', async () => {
  const { saveProfilePhoto, calls } = fixture(new Error('Profile incomplete'))
  const result = await saveProfilePhoto('verified-member', new File(['raw'], 'photo.png'))
  assert.equal(result.status, 409)
  assert.deepEqual(calls.at(-1), ['remove', ['verified-member/photo-id.jpg']])
  assert.ok(!calls.some(call => call[0] === 'deliver'))
})
