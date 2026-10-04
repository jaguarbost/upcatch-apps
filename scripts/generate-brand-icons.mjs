import sharp from 'sharp'
import { readFile, writeFile } from 'node:fs/promises'

const svg = await readFile(new URL('../public/upcatch-mark.svg', import.meta.url))
const png = size => sharp(svg).resize(size, size).png().toBuffer()
for (const [name, size] of [['icon-512.png', 512], ['icon-192.png', 192], ['apple-icon.png', 180], ['icon-light-32x32.png', 32], ['icon-dark-32x32.png', 32]]) {
  await writeFile(new URL('../public/' + name, import.meta.url), await png(size))
}
await writeFile(new URL('../public/upcatch-logo.svg', import.meta.url), svg)
await writeFile(new URL('../public/icon.svg', import.meta.url), svg)
// A maskable icon keeps all logo geometry inside the central safe zone.
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#2b59ff' } })
  .composite([{ input: await png(360), left: 76, top: 76 }]).png()
  .toFile(new URL('../public/icon-maskable-512.png', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
// ICO directory entries contain lossless PNG payloads for modern browsers.
const sizes = [16, 32, 48]
const frames = await Promise.all(sizes.map(png))
const header = Buffer.alloc(6 + sizes.length * 16)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(sizes.length, 4)
let offset = header.length
frames.forEach((frame, index) => {
  const entry = 6 + index * 16
  header[entry] = sizes[index]
  header[entry + 1] = sizes[index]
  header.writeUInt16LE(1, entry + 4)
  header.writeUInt16LE(32, entry + 6)
  header.writeUInt32LE(frame.length, entry + 8)
  header.writeUInt32LE(offset, entry + 12)
  offset += frame.length
})
await writeFile(new URL('../public/favicon.ico', import.meta.url), Buffer.concat([header, ...frames]))
console.log('Generated UpCatch logo, app icons, Apple icon, maskable icon and favicon')
