import sharp from 'sharp'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(root, 'store-assets', 'android')
await mkdir(output, { recursive: true })
const iosOutput = join(root, 'store-assets', 'ios')
await mkdir(iosOutput, { recursive: true })

// Google Play masks the store icon itself, so fill the square with the approved blue.
const mark = await readFile(join(root, 'public', 'upcatch-mark.svg'), 'utf8')
const icon = await sharp(Buffer.from(mark.replace('rx="19"', 'rx="0"')))
  .resize(512, 512)
  .ensureAlpha()
  .png({ palette: false })
  .toBuffer()
await writeFile(join(output, 'play-icon-512.png'), icon)
const iosIcon = await sharp(Buffer.from(mark.replace('rx="19"', 'rx="0"')))
  .resize(1024, 1024)
  .flatten({ background: '#2b59ff' })
  .removeAlpha()
  .png({ palette: false })
  .toBuffer()
await writeFile(join(iosOutput, 'app-icon-1024.png'), iosIcon)

// Extend the approved brand palette with an existing UpCatch cafe image.
const photo = await sharp(join(root, 'public', 'landing', 'cafe-lunch.png'))
  .resize(700, 500, { fit: 'cover', position: 'centre' })
  .png()
  .toBuffer()
const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
  <path d="M0 0H405L335 500H0Z" fill="#2b59ff"/>
  <path d="M405 0H428L358 500H335Z" fill="#ffc940"/>
  <path d="M161 228L225 275" stroke="#ffc940" stroke-width="20" stroke-linecap="round"/>
  <circle cx="128" cy="203" r="43" fill="#2b59ff" stroke="#ffc940" stroke-width="20"/>
  <circle cx="258" cy="300" r="43" fill="#2b59ff" stroke="#ffc940" stroke-width="20"/>
</svg>`)
const featureComposite = await sharp({ create: { width: 1024, height: 500, channels: 3, background: '#2b59ff' } })
  .composite([{ input: photo, left: 324, top: 0 }, { input: overlay, left: 0, top: 0 }])
  .png()
  .toBuffer()
const feature = await sharp(featureComposite)
  .flatten({ background: '#2b59ff' })
  .removeAlpha()
  .png({ palette: false })
  .toBuffer()
await writeFile(join(output, 'feature-graphic-1024x500.png'), feature)

for (const [name, expectedWidth, expectedHeight, expectedChannels] of [
  ['play-icon-512.png', 512, 512, 4],
  ['feature-graphic-1024x500.png', 1024, 500, 3],
]) {
  const metadata = await sharp(join(output, name)).metadata()
  if (metadata.width !== expectedWidth || metadata.height !== expectedHeight || metadata.channels !== expectedChannels)
    throw new Error(`${name} does not match its Play Console image specification.`)
}
if (icon.length > 1024 * 1024) throw new Error('Play icon exceeds the 1 MB limit.')
const iosMetadata = await sharp(join(iosOutput, 'app-icon-1024.png')).metadata()
if (iosMetadata.width !== 1024 || iosMetadata.height !== 1024 || iosMetadata.channels !== 3)
  throw new Error('The App Store icon must be a 1024px square without transparency.')
console.log(`Generated Play icon (${icon.length} bytes), feature graphic (${feature.length} bytes), and App Store icon (${iosIcon.length} bytes)`)
