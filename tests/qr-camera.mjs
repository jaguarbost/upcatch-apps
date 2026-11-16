import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'

const compile = async path => ts.transpileModule(await readFile(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const permissionCode = await compile('lib/native/qr-camera.ts')
const hookCode = await compile('components/upcatch/use-qr-camera.ts')
const flush = () => new Promise(setImmediate)

function permissionFixture(platform, status) {
  const calls = []
  const exports = {}
  vm.runInNewContext(permissionCode, { exports, require: () => ({
    Capacitor: { isNativePlatform: () => platform !== 'web', getPlatform: () => platform },
    registerPlugin: name => {
      assert.equal(name, 'UpCatchCamera')
      return {
        requestPermission: async () => { calls.push('permission'); return { status } },
        openSettings: async () => { calls.push('settings') },
      }
    },
  }) })
  return { ...exports, calls }
}

test('iOS requests native camera permission and can open the app Settings', async () => {
  const camera = permissionFixture('ios', 'granted')
  await camera.requestQrCameraPermission()
  await camera.openQrCameraSettings()
  assert.deepEqual(camera.calls, ['permission', 'settings'])
})

test('iOS denial explains Settings; restrictions do not promise a permission toggle', async () => {
  await assert.rejects(permissionFixture('ios', 'denied').requestQrCameraPermission(), { name: 'NotAllowedError', message: /Open Settings/ })
  await assert.rejects(permissionFixture('ios', 'restricted').requestQrCameraPermission(), { name: 'CameraRestrictedError', message: /Screen Time/ })
})

test('web and Android camera requests do not call the iOS-only bridge', async () => {
  for (const platform of ['web', 'android']) {
    const camera = permissionFixture(platform, 'denied')
    await camera.requestQrCameraPermission()
    assert.deepEqual(camera.calls, [])
  }
})

function hookFixture(requestPermission) {
  const calls = [], state = [], listeners = new Map()
  let cleanup, stateIndex = 0
  const player = { play: async () => {}, srcObject: null, readyState: 0 }
  const document = {
    visibilityState: 'visible',
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: name => listeners.delete(name),
    createElement: () => ({ getContext: () => ({}) }),
  }
  const exports = {}
  vm.runInNewContext(hookCode, {
    exports, Error, window: { isSecureContext: false }, document,
    navigator: { mediaDevices: { getUserMedia: async () => {
      calls.push('media'); return { getTracks: () => [{ stop: () => calls.push('stop') }] }
    } } },
    setTimeout: () => 1, clearTimeout: () => {},
    require: name => name === 'react' ? {
      useRef: value => ({ current: value === null ? player : value }),
      useState: () => {
        const index = stateIndex++
        state[index] = index === 1 ? 1 : null
        return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value }]
      },
      useEffect: effect => { cleanup = effect() },
    } : name === 'jsqr' ? { default: () => null } : {
      isIosCamera: () => true,
      requestQrCameraPermission: requestPermission,
      openQrCameraSettings: async () => { calls.push('settings') },
    },
  })
  const hook = exports.useQrCamera(async () => false)
  return { calls, state, hook, cleanup: () => cleanup(), visibility: value => {
    document.visibilityState = value; listeners.get('visibilitychange')?.()
  } }
}

test('denied camera does not start capture and exposes Settings; returning retries', async () => {
  const fixture = hookFixture(async () => { throw Object.assign(new Error('Denied'), { name: 'NotAllowedError' }) })
  await flush()
  assert.equal(fixture.calls.includes('media'), false)
  assert.equal(fixture.state[2], true)
  assert.match(fixture.state[0], /enable Camera for UpCatch/)
  await fixture.hook.openSettings()
  assert.deepEqual(fixture.calls, ['settings'])
  fixture.visibility('hidden'); fixture.visibility('visible')
  assert.equal(fixture.state[1], 2)
  fixture.cleanup()
})

test('permission dialog visibility does not cancel capture; background stops the camera', async () => {
  let grant
  const fixture = hookFixture(() => new Promise(resolve => { grant = resolve }))
  fixture.visibility('hidden'); fixture.visibility('visible')
  assert.equal(fixture.state[1], 1)
  grant()
  await flush(); await flush()
  assert.deepEqual(fixture.calls, ['media'])
  fixture.visibility('hidden')
  assert.equal(fixture.calls.includes('stop'), true)
  fixture.cleanup()
})

test('leaving scanner while permission is pending never starts camera capture', async () => {
  let grant
  const fixture = hookFixture(() => new Promise(resolve => { grant = resolve }))
  fixture.cleanup(); grant()
  await flush()
  assert.deepEqual(fixture.calls, [])
})
