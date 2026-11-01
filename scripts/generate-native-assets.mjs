import sharp from 'sharp'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const brand = '#2b59ff'
const live = '#ffc940'
const smile = `<circle cx="18" cy="22" r="5" fill="white"/><circle cx="46" cy="22" r="5" fill="white"/><path d="M18 35v4c0 8 6 14 14 14s14-6 14-14v-4" stroke="white" stroke-width="7" stroke-linecap="round"/>`
const square = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" fill="${brand}"/>${smile}</svg>`
const monochrome = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">${smile}</svg>`
const mark = await readFile(join(root, 'public', 'upcatch-mark.svg'))
const png = (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer()
const ios = join(root, 'ios', 'App', 'App', 'Assets.xcassets')
await writeFile(join(ios, 'AppIcon.appiconset', 'AppIcon-512@2x.png'),
  await sharp(Buffer.from(square)).resize(1024, 1024).flatten({ background: brand }).png().toBuffer())
const splash = await sharp({ create: { width: 2732, height: 2732, channels: 4, background: live } })
  .composite([{ input: await sharp(mark).resize(620, 620).png().toBuffer(), left: 1056, top: 1056 }]).png().toBuffer()
for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  await writeFile(join(ios, 'Splash.imageset', name), splash)
}
const android = join(root, 'android', 'app', 'src', 'main', 'res')
for (const [density, size] of Object.entries({ mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })) {
  const directory = join(android, `mipmap-${density}`)
  await writeFile(join(directory, 'ic_launcher.png'), await png(square, size))
  await writeFile(join(directory, 'ic_launcher_round.png'), await png(square, size))
  await writeFile(join(directory, 'ic_launcher_foreground.png'), await png(monochrome, size))
  const notificationDirectory = join(android, `drawable-${density}`)
  await mkdir(notificationDirectory, { recursive: true })
  await writeFile(join(notificationDirectory, 'ic_stat_upcatch.png'), await png(monochrome, Math.round(24 * size / 48)))
}
for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
  for (const orientation of ['port', 'land']) {
    const path = join(android, `drawable-${orientation}-${density}`, 'splash.png')
    await writeFile(path, await sharp(splash).resize(512, 512).png().toBuffer())
  }
}
await writeFile(join(android, 'drawable', 'splash.png'), await sharp(splash).resize(512, 512).png().toBuffer())
console.log('Generated UpCatch native icon, splash and notification assets')
