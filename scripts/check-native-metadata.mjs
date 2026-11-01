import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import sharp from 'sharp'

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8')
const packageJson = JSON.parse(await read('package.json'))
const gradle = await read('android/app/build.gradle')
const xcode = await read('ios/App/App.xcodeproj/project.pbxproj')
const androidVersion = gradle.match(/\bversionName\s+"([^"]+)"/)?.[1]
const androidBuild = Number(gradle.match(/\bversionCode\s+(\d+)/)?.[1])
const iosVersions = [...xcode.matchAll(/\bMARKETING_VERSION = ([^;]+);/g)].map(match => match[1])
const iosBuilds = [...xcode.matchAll(/\bCURRENT_PROJECT_VERSION = (\d+);/g)].map(match => Number(match[1]))
assert.equal(androidVersion, packageJson.version, 'Android versionName differs from package.json')
assert.ok(iosVersions.length >= 2 && iosVersions.every(value => value === packageJson.version), 'iOS marketing versions differ from package.json')
assert.ok(Number.isSafeInteger(androidBuild) && androidBuild > 0, 'Android build number must be positive')
assert.ok(iosBuilds.length >= 2 && iosBuilds.every(value => value === androidBuild), 'iOS build numbers differ from Android')
for (const path of [
  'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png',
  'ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png',
  'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png',
  'android/app/src/main/res/drawable-xxxhdpi/ic_stat_upcatch.png',
]) assert.ok((await stat(new URL('../' + path, import.meta.url))).size > 0, `Missing native asset: ${path}`)
const icon = await sharp(new URL('../ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')).metadata()
assert.equal(icon.width, 1024, 'iOS app icon must be 1024 pixels wide')
assert.equal(icon.height, 1024, 'iOS app icon must be 1024 pixels high')
assert.equal(icon.hasAlpha, false, 'iOS app icon must be opaque')
console.log(`Native metadata and assets align with package.json ${packageJson.version}, build ${androidBuild}`)
