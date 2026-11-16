import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

async function compile(path, mocks = {}) {
  const exports = {}
  const js = ts.transpileModule(await readFile(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'exports', js)(name => { if (!(name in mocks)) throw Error('Unexpected import: ' + name); return mocks[name] }, exports)
  return exports
}
const flow = await compile('lib/onboarding-flow.ts', { './upcatch-data': { INTERESTS: ['Coffee', 'Books', 'Music', 'Design'] } })
class MobileApiError extends Error { constructor(status, message) { super(message); this.status = status } }
async function fixture({ upload = { photoSaved: true, nextStep: 'about', message: 'Saved' }, progress = {}, about = { completed: true } } = {}) {
  const calls = []
  const client = {
    uploadPhoto: async (...args) => { calls.push(['upload', ...args]); if (upload instanceof Error) throw upload; return upload },
    bootstrap: async () => { calls.push(['bootstrap']); return progress },
    saveOnboardingAbout: async (...args) => { calls.push(['about', ...args]); return about },
  }
  const transport = await compile('lib/onboarding-transport.ts', {
    '@/lib/supabase/client': { createClient: () => ({ auth: {} }) },
    './native/api-client': { MobileApi: class { constructor() { return client } }, MobileApiError }, './onboarding-flow': flow,
  })
  return { ...transport, calls }
}

test('new onboarding opts photo upload into version 2 and advances only on confirmed photo success', async () => {
  const api = await fixture()
  const photo = new File(['photo'], 'photo.jpg')
  assert.equal((await api.saveOnboardingPhoto(photo)).nextStep, 'about')
  assert.deepEqual(api.calls, [['upload', photo, 2]])
  const invalid = await fixture({ upload: { message: 'Saved' } })
  await assert.rejects(invalid.saveOnboardingPhoto(photo), /did not confirm/)
  assert.equal(invalid.calls.at(-1)[0], 'bootstrap')
})

test('an ambiguous upload resumes from saved backend progress without uploading twice', async () => {
  const api = await fixture({ upload: new MobileApiError(0, 'Upload timed out'), progress: { photoSaved: true, aboutPending: true, completed: false } })
  assert.equal((await api.saveOnboardingPhoto(new File(['photo'], 'photo.jpg'))).nextStep, 'about')
  assert.deepEqual(api.calls.map(call => call[0]), ['upload', 'bootstrap'])
  const missing = await fixture({ upload: new MobileApiError(0, 'Upload timed out') })
  await assert.rejects(missing.saveOnboardingPhoto(new File(['photo'], 'photo.jpg')), /Upload timed out/)
})

test('non-success validation responses never advance even if an old photo exists', async () => {
  const api = await fixture({ upload: new MobileApiError(400, 'Invalid photo'), progress: { photoSaved: true, completed: true } })
  await assert.rejects(api.saveOnboardingPhoto(new File(['photo'], 'photo.jpg')), /Invalid photo/)
  assert.deepEqual(api.calls.map(call => call[0]), ['upload'])
})

test('about validates trimmed bio and distinct supported interests before saving and requires completed true', async () => {
  const api = await fixture()
  await api.saveOnboardingAbout('  Hello  ', ['Coffee', 'Books', 'Music'])
  assert.deepEqual(api.calls, [['about', 'Hello', ['Coffee', 'Books', 'Music']]])
  for (const [bio, interests] of [[' ', ['Coffee', 'Books', 'Music']], ['x'.repeat(501), ['Coffee', 'Books', 'Music']], ['Hello', ['Coffee', 'Coffee', 'Music']], ['Hello', ['Coffee', 'Books', 'unsupported']]]) {
    await assert.rejects(api.saveOnboardingAbout(bio, interests))
  }
  assert.equal(api.calls.length, 1)
  const unfinished = await fixture({ about: { completed: false } })
  await assert.rejects(unfinished.saveOnboardingAbout('Hello', ['Coffee', 'Books', 'Music']), /not confirmed/)
})

test('resume step uses explicit saved-photo/about flags and preserves legacy routing', () => {
  assert.equal(flow.initialOnboardingStep(), 0)
  assert.equal(flow.initialOnboardingStep({ detailsSaved: false }), 1)
  assert.equal(flow.initialOnboardingStep({ detailsSaved: true }), 2)
  assert.equal(flow.initialOnboardingStep({ detailsSaved: true, photoSaved: true, aboutPending: true }), 4)
  assert.equal(flow.initialOnboardingStep({ detailsSaved: true, photoSaved: true, aboutPending: false }), 2)
})
