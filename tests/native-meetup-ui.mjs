import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

// Exercise component events and effects without claiming an installed-device test.
async function fixture(path, imports = {}) {
  let cursor = 0
  const slots = [], pending = []
  const react = {
    createContext: () => ({ Provider: 'ContextProvider' }),
    useMemo: fn => fn(),
    useState(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value }]
    },
    useRef(initial) {
      const index = cursor++
      return slots[index] ??= { current: initial }
    },
    useEffect(effect, deps) {
      const index = cursor++, previous = slots[index]
      if (!previous || !deps || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        pending.push(() => { previous?.cleanup?.(); slots[index] = { deps, cleanup: effect() } })
      }
    },
    useCallback: callback => callback,
  }
  const jsx = (type, props) => ({ type, props })
  const mocks = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'lucide-react': new Proxy({}, { get: (_, name) => String(name) }),
    '@/lib/utils': { cn: (...args) => args.filter(Boolean).join(' ') },
    './primitives': Object.fromEntries(['BottomSheet', 'PersonAvatar', 'PrimaryButton', 'Chip', 'CountdownRing', 'Verified'].map(name => [name, name])),
    './request-profile': { RequestProfile: 'RequestProfile' },
    './safety-sheet': { SafetySheet: 'SafetySheet' },
    ...imports,
  }
  const compiled = ts.transpileModule(await readFile(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const exports = {}
  new Function('require', 'exports', compiled)(name => {
    if (!(name in mocks)) throw Error('Unexpected import: ' + name)
    return mocks[name]
  }, exports)
  return {
    render(name, props) { cursor = 0; const tree = exports[name](props); for (const effect of pending.splice(0)) effect(); return tree },
    close() { for (const slot of slots) slot?.cleanup?.() },
  }
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return []
  if (Array.isArray(tree)) return tree.flatMap(nodes)
  return [tree, ...nodes(tree.props?.children)]
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join('')
  if (tree && typeof tree === 'object') return text(tree.props?.children)
  return tree == null || tree === false ? '' : String(tree)
}
const person = { id: 'other-member', name: 'Sam', photo: '/api/member-photo?meetup=real', initials: 'SA', interests: ['Coffee'], walkMin: 2, distanceKm: 1 }
const venue = { walkMin: 2, name: 'Cafe', address: 'Public street' }
const data = { intentById: () => ({ label: 'Coffee', icon: 'Coffee' }), clockIn: () => '12:00', sharedInterests: () => [] }

async function onboardingFixture(live, transport = {}) {
  const shared = { INTERESTS: ['Coffee', 'Books', 'Music', 'Design'] }
  const flow = {}
  new Function('require', 'exports', ts.transpileModule(await readFile('lib/onboarding-flow.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(() => shared, flow)
  return fixture('components/upcatch/onboarding.tsx', {
    './app-provider': { useUpCatch: () => ({ state: { live }, actions: {} }) },
    'next/link': { default: 'Link' }, '@/components/account/onboarding-permissions': { OnboardingPermissions: 'OnboardingPermissions' },
    '@/app/onboarding/actions': { saveDetails: async () => ({ message: 'Saved' }) },
    '@/lib/onboarding-flow': flow, '@/lib/onboarding-transport': transport,
    '@/lib/prepare-profile-photo': { prepareProfilePhoto: async file => file }, '@/lib/haptics': { haptic() {} },
    '@/lib/upcatch-data': shared, './brand-badge': { LogoMark: 'LogoMark' }, './landing-story': { LandingStory: 'LandingStory' },
  })
}

test('photo failure preserves selected file; success advances to step four and bio retries never repeat photo upload', async t => {
  const previousWindow = global.window
  const redirects = [], uploaded = [], introductions = []
  global.window = { location: { assign: path => redirects.push(path) } }
  t.after(() => { global.window = previousWindow })
  const live = { memberId: 'member-a', name: 'Sam', detailsSaved: true, photoSaved: false, aboutPending: false }
  const view = await onboardingFixture(live, {
    saveOnboardingPhoto: async file => { uploaded.push(file); if (uploaded.length === 1) throw Error('Network lost'); return { photoSaved: true, nextStep: 'about' } },
    saveOnboardingAbout: async (bio, interests) => { introductions.push({ bio, interests }); if (introductions.length === 1) throw Error('Please retry your introduction') },
  })
  let tree = view.render('Onboarding')
  nodes(tree).find(node => node.type === 'OnboardingPermissions').props.onLocation()
  tree = view.render('Onboarding')
  const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })
  nodes(tree).find(node => node.type === 'input' && node.props.type === 'file').props.onChange({ target: { files: [file], value: 'photo.jpg' } })
  await new Promise(setImmediate)
  tree = view.render('Onboarding'); tree = view.render('Onboarding')
  await nodes(tree).find(node => node.type === 'PrimaryButton').props.onClick()
  tree = view.render('Onboarding')
  assert.ok(text(tree).includes('Network lost'))
  assert.equal(nodes(tree).find(node => node.type === 'PrimaryButton').props.disabled, false)
  await nodes(tree).find(node => node.type === 'PrimaryButton').props.onClick()
  tree = view.render('Onboarding')
  assert.equal(nodes(tree).find(node => node.props?.role === 'progressbar').props['aria-valuenow'], 4)
  assert.equal(nodes(tree).find(node => node.props?.role === 'progressbar').props['aria-valuemax'], 4)
  assert.deepEqual(uploaded, [file, file])
  assert.deepEqual(redirects, [])
  nodes(tree).find(node => node.type === 'textarea').props.onChange({ target: { value: '  A little about Sam  ' } })
  for (const interest of ['Coffee', 'Books', 'Music']) nodes(tree).find(node => node.type === 'Chip' && text(node) === interest).props.onClick()
  tree = view.render('Onboarding')
  await nodes(tree).find(node => node.type === 'PrimaryButton').props.onClick()
  tree = view.render('Onboarding')
  assert.ok(text(tree).includes('Please retry your introduction'))
  assert.equal(nodes(tree).find(node => node.type === 'textarea').props.value, '  A little about Sam  ')
  assert.equal(nodes(tree).filter(node => node.type === 'Chip' && node.props.active).length, 3)
  assert.equal(uploaded.length, 2)
  assert.deepEqual(redirects, [])
  await nodes(tree).find(node => node.type === 'PrimaryButton').props.onClick()
  assert.deepEqual(introductions, [0, 1].map(() => ({ bio: 'A little about Sam', interests: ['Coffee', 'Books', 'Music'] })))
  assert.deepEqual(redirects, ['/'])
  assert.equal(uploaded.length, 2)
  view.close()
})

test('a relaunch with saved photo and pending introduction resumes step four with persisted fields', async () => {
  const view = await onboardingFixture({ memberId: 'member-a', detailsSaved: true, photoSaved: true, aboutPending: true, bio: 'Saved draft', interests: ['Coffee', 'Books', 'Music'] })
  const tree = view.render('Onboarding')
  assert.equal(nodes(tree).find(node => node.props?.role === 'progressbar').props['aria-valuenow'], 4)
  assert.equal(nodes(tree).find(node => node.type === 'textarea').props.value, 'Saved draft')
  assert.equal(nodes(tree).filter(node => node.type === 'Chip' && node.props.active).length, 3)
  assert.equal(nodes(tree).some(node => node.type === 'OnboardingPermissions'), false)
  view.close()
})

test('denied location stays on the permission step and allows retry without false progress', async () => {
  class LocationError extends Error { status = 'denied' }
  let attempts = 0, continued = 0
  const view = await fixture('components/account/onboarding-permissions.tsx', {
    '@/components/upcatch/primitives': { PrimaryButton: 'PrimaryButton' },
    '@/lib/browser-location': { LocationError, saveBrowserLocation: async () => { if (++attempts === 1) throw new LocationError('Location denied') } },
    '@/lib/browser-permissions': { observeLocationPermission: () => () => {} },
    './location-help': { LocationHelp: 'LocationHelp' }, './install-app': { InstallAppCard: 'InstallAppCard' },
  })
  let tree = view.render('OnboardingPermissions', { onLocation: () => continued++ })
  await nodes(tree).find(node => node.type === 'PrimaryButton').props.onClick()
  tree = view.render('OnboardingPermissions', { onLocation: () => continued++ })
  assert.equal(continued, 0)
  assert.ok(text(tree).includes('Location denied'))
  assert.equal(nodes(tree).find(node => node.type === 'PrimaryButton').props.disabled, false)
  await nodes(tree).find(node => node.type === 'PrimaryButton').props.onClick()
  assert.equal(continued, 1)
  view.close()
})

test('image-only walkthrough navigates the three supplied screenshots and has no added visible copy', async () => {
  let closed = 0
  const view = await fixture('components/upcatch/quick-start-slides.tsx')
  const props = { onClose: () => closed++, onHelp() {} }
  let tree = view.render('QuickStartSlides', props)
  assert.equal(text(tree), '')
  assert.equal(nodes(tree).find(node => node.type === 'img').props.src, '/onboarding/how-it-works-1.webp')
  assert.equal(nodes(tree).find(node => node.props?.['aria-label'] === 'Previous step').props.disabled, true)
  nodes(tree).find(node => node.props?.['aria-label'] === 'Next step').props.onClick()
  tree = view.render('QuickStartSlides', props)
  assert.equal(nodes(tree).find(node => node.type === 'img').props.src, '/onboarding/how-it-works-2.webp')
  nodes(tree).find(node => node.props?.['aria-label'] === 'Go to step 3').props.onClick()
  tree = view.render('QuickStartSlides', props)
  assert.equal(nodes(tree).find(node => node.type === 'img').props.src, '/onboarding/how-it-works-3.webp')
  nodes(tree).find(node => node.props?.['aria-label'] === 'Finish how it works').props.onClick()
  assert.equal(closed, 1)
  view.close()
})

test('walkthrough waits for onboarding, preserves its seen choice and yields to active meetup requests', async t => {
  const previousStorage = global.localStorage, previousDocument = global.document
  const values = new Map()
  global.localStorage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }
  global.document = { activeElement: null }
  t.after(() => { global.localStorage = previousStorage; global.document = previousDocument })
  const state = { live: {}, onboarded: false, phase: 'idle' }
  const view = await fixture('components/upcatch/how-it-works.tsx', {
    './app-provider': { useUpCatch: () => ({ state }) }, './quick-start-slides': { QuickStartSlides: 'QuickStartSlides' },
  })
  assert.equal(nodes(view.render('HowItWorksProvider', {})).some(node => node.type === 'QuickStartSlides'), false)
  state.onboarded = true
  view.render('HowItWorksProvider', {})
  let tree = view.render('HowItWorksProvider', {})
  assert.ok(nodes(tree).some(node => node.type === 'QuickStartSlides'))
  state.phase = 'incoming'
  view.render('HowItWorksProvider', {})
  tree = view.render('HowItWorksProvider', {})
  assert.equal(nodes(tree).some(node => node.type === 'QuickStartSlides'), false)
  state.phase = 'idle'
  view.render('HowItWorksProvider', {})
  tree = view.render('HowItWorksProvider', {})
  nodes(tree).find(node => node.type === 'QuickStartSlides').props.onClose()
  assert.equal(values.get('upcatch:quick-start:v1'), '1')
  assert.equal(nodes(view.render('HowItWorksProvider', {})).some(node => node.type === 'QuickStartSlides'), false)
  view.close()
})

test('onboarding exits the photo flow when refreshed bootstrap confirms completion without remounting', async t => {
  const previousWindow = global.window, previousDocument = global.document
  global.window = { location: { pathname: '/onboarding', search: '' }, setTimeout, clearTimeout }
  global.document = { visibilityState: 'hidden' }
  t.after(() => { global.window = previousWindow; global.document = previousDocument })
  const sharedData = {}
  const compiledData = ts.transpileModule(await readFile('lib/upcatch-data.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  new Function('require', 'exports', compiledData)(() => new Proxy({}, { get: (_, name) => String(name) }), sharedData)
  const view = await fixture('components/upcatch/app-provider.tsx', {
    '@/lib/upcatch-data': sharedData,
    '@/lib/supabase/client': { createClient: () => ({ auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } }) },
    '@/lib/push-client': {},
    '@/lib/browser-location': {},
    '@/lib/browser-permissions': { observeLocationPermission: () => () => {} },
    '@/lib/haptics': { haptic() {} },
  })
  let initial = { memberId: 'member-a', name: 'Sam', completed: false, photo: null, venues: [], center: [0, 0] }
  assert.equal(view.render('UpCatchProvider', { initial }).props.value.state.onboarded, false)
  initial = { ...initial, completed: true, photo: 'https://private.example/new-signed-photo' }
  view.render('UpCatchProvider', { initial })
  const state = view.render('UpCatchProvider', { initial }).props.value.state
  assert.equal(state.onboarded, true)
  assert.equal(state.user.photo, initial.photo)
  view.close()
})

test('meetup button opens its live conversation using loaded count and keeps QR friendship flow', async () => {
  const calls = []
  const state = { meetup: { person, intent: 'coffee', startLabel: '12:00', endLabel: '13:00' }, phase: 'arrived', live: {}, progress: { me: 1, them: 1 }, user: {}, messages: [{ id: 1 }, { id: 2 }] }
  const actions = { openMessages: target => calls.push(['messages', target]), openFriends: (...args) => calls.push(['friends', ...args]) }
  const view = await fixture('components/upcatch/live-meetup.tsx', { './app-provider': { useUpCatch: () => ({ state, actions }), useVenueLookup: () => () => venue }, '@/lib/upcatch-data': data })
  let tree = view.render('LiveMeetup')
  const messages = nodes(tree).find(node => node.type === 'PrimaryButton' && text(node).includes('Msgs'))
  assert.equal(text(messages).trim(), 'Msgs 2')
  messages.props.onClick()
  const footer = nodes(tree).find(node => node.type === 'PrimaryButton' && text(node).includes('Become friends'))
  assert.equal(footer.props.variant, 'live')
  footer.props.onClick()
  assert.deepEqual(calls, [['messages', 'live'], ['friends', 'show', person]])
  nodes(tree).find(node => node.props?.['aria-label'] === 'View Sam profile').props.onClick()
  tree = view.render('LiveMeetup')
  const profile = nodes(tree).find(node => node.type === 'RequestProfile')
  assert.equal(profile.props.person, person)
  assert.equal(profile.props.seconds, undefined, 'paired profile has no request countdown')
  assert.equal(nodes(tree).filter(node => node.type === 'input').length, 0, 'chat input lives in Messages')
})

test('incoming photo opens real profile while absolute offer deadline keeps running and closes on expiry', async t => {
  let now = 100000, tick
  t.mock.method(Date, 'now', () => now)
  const previousWindow = global.window
  global.window = { setInterval: fn => { tick = fn; return 1 }, clearInterval: () => {} }
  t.after(() => { global.window = previousWindow })
  const state = { live: {}, liveMatch: { id: 'offer-1', proposal_expires_at: new Date(now + 30000).toISOString() }, user: { interests: [] } }
  const view = await fixture('components/upcatch/incoming-card.tsx', { './app-provider': { useUpCatch: () => ({ state, actions: { refreshFriends: async () => {} } }), useVenueLookup: () => () => venue }, '@/lib/upcatch-data': data })
  const offer = { person, intent: 'coffee', startsInMin: 0 }
  let tree = view.render('IncomingCard', { offer })
  nodes(tree).find(node => node.props?.['aria-label'] === 'View Sam profile').props.onClick()
  now += 10000; tick()
  tree = view.render('IncomingCard', { offer })
  const profile = nodes(tree).find(node => node.type === 'RequestProfile')
  assert.equal(profile.props.person, person)
  assert.equal(profile.props.seconds, 20)
  now += 20001; tick()
  tree = view.render('IncomingCard', { offer })
  assert.equal(nodes(tree).some(node => node.type === 'RequestProfile'), false)
  view.close()
})

test('live Messages retains persisted timestamps and venue suggestions and sends quick replies to meetup', async () => {
  const sent = []
  const state = { messageTarget: 'live', meetup: { person }, scheduledPlans: [], scheduledMessageMap: {}, friends: [], history: [], messages: [{ id: 1, text: 'Hello', from: 'them', created_at: '2026-11-15T12:34:00Z' }] }
  const view = await fixture('components/upcatch/messages-screen.tsx', {
    './app-provider': { useUpCatch: () => ({ state, actions: { sendMessage: text => sent.push(text) } }) },
    '@/lib/supabase/client': { createClient: () => { throw Error('Unexpected friend RPC') } },
    './message-timestamp': { MessageTimestamp: 'MessageTimestamp' },
  })
  let tree = view.render('MessagesScreen')
  assert.equal(nodes(tree).find(node => node.type === 'MessageTimestamp').props.createdAt, state.messages[0].created_at)
  nodes(tree).find(node => node.type === 'button' && text(node) === 'Coffee').props.onClick()
  tree = view.render('MessagesScreen')
  assert.equal(nodes(tree).find(node => node.type === 'input').props.value, 'Costa or Pret?')
  nodes(tree).find(node => node.type === 'button' && text(node) === 'On my way').props.onClick()
  assert.deepEqual(sent, ['On my way'])
})

test('native profile photo prepares selected file, uploads photo field and refreshes native bootstrap on success', async t => {
  const events = [], uploads = [], prepared = new File(['prepared'], 'profile.jpg', { type: 'image/jpeg' })
  const previousWindow = global.window
  global.window = { dispatchEvent: event => events.push(event.type) }
  t.after(() => { global.window = previousWindow })
  const view = await fixture('native-client/profile-photo-upload.tsx', {
    '@/components/upcatch/primitives': { PrimaryButton: 'PrimaryButton' },
    '@/lib/prepare-profile-photo': { prepareProfilePhoto: async () => prepared },
    './onboarding-actions': { uploadPhoto: async (_, form) => { uploads.push(form.get('photo')); return { message: 'Saved' } } },
  })
  let tree = view.render('PhotoUpload')
  assert.equal(nodes(tree).find(node => node.props?.capture === 'user').type, 'input')
  nodes(tree).find(node => node.type === 'input' && !node.props.capture).props.onChange({ target: { files: [new File(['original'], 'photo.png')], value: 'photo.png' } })
  await new Promise(setImmediate)
  tree = view.render('PhotoUpload')
  nodes(tree).find(node => node.type === 'PrimaryButton').props.onClick()
  await new Promise(setImmediate)
  tree = view.render('PhotoUpload')
  assert.equal(await uploads[0].text(), 'prepared')
  assert.deepEqual(events, ['upcatch:native-reload'])
  assert.ok(text(tree).includes('Photo saved.'))
  view.close()
})

test('native legal links use hosted browser pages without replacing signed-in app route', async () => {
  const opened = []
  const view = await fixture('native-client/link.tsx', {
    '@capacitor/browser': { Browser: { open: async args => opened.push(args.url) } },
    './config': { nativePublicConfig: { apiBaseUrl: 'https://www.upcatch.uk' } },
  })
  for (const href of ['/terms', '/privacy']) {
    const tree = view.render('default', { href, children: href })
    let prevented = false
    tree.props.onClick({ button: 0, preventDefault: () => { prevented = true } })
    assert.equal(prevented, true)
  }
  assert.deepEqual(opened, ['https://www.upcatch.uk/terms', 'https://www.upcatch.uk/privacy'])
})
