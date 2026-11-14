import sharp from 'sharp'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const splashOnly = process.argv.includes('--splash-only')
const live = '#ffc940'
const smile = `<circle cx="18" cy="22" r="5" fill="white"/><circle cx="46" cy="22" r="5" fill="white"/><path d="M18 35v4c0 8 6 14 14 14s14-6 14-14v-4" stroke="white" stroke-width="7" stroke-linecap="round"/>`
const monochrome = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">${smile}</svg>`
const mark = await readFile(join(root, 'public', 'upcatch-mark.svg'))
const launcherIcon = await readFile(join(root, 'appIcon.png'))
const png = (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer()
const ios = join(root, 'ios', 'App', 'App', 'Assets.xcassets')
if (!splashOnly) await writeFile(join(ios, 'AppIcon.appiconset', 'AppIcon-512@2x.png'),
  await sharp(launcherIcon).resize(1024, 1024).flatten({ background: '#ffffff' }).removeAlpha().png().toBuffer())
const wordmark = await sharp({ text: {
  text: '<span foreground="#ffc940">Up</span><span foreground="#2b59ff">Catch</span><span foreground="#0e1726">.</span>',
  font: 'Bricolage Grotesque Ultra-Bold 180',
  fontfile: join(root, 'scripts', 'fonts', 'BricolageGrotesque.ttf'), rgba: true,
} }).png().toBuffer()
const tagline = await sharp({ text: {
  text: '<span foreground="#0e1726">Never go alone</span>', font: 'Figtree Semi-Bold 72',
  fontfile: join(root, 'scripts', 'fonts', 'Figtree.ttf'), rgba: true,
} }).png().toBuffer()
const wordmarkSize = await sharp(wordmark).metadata()
const taglineSize = await sharp(tagline).metadata()
const plaque = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1032" height="250"><rect width="1032" height="250" rx="64" fill="white"/></svg>')
const splash = await sharp({ create: { width: 2732, height: 2732, channels: 4, background: live } })
  .composite([
    { input: await sharp(mark).resize(620, 620).png().toBuffer(), left: 1056, top: 780 },
    { input: plaque, left: 850, top: 1500 },
    { input: wordmark, left: Math.round((2732-wordmarkSize.width)/2), top: 1500+Math.round((250-wordmarkSize.height)/2) },
    { input: tagline, left: Math.round((2732-taglineSize.width)/2), top: 1820 },
  ]).png().toBuffer()
for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  await writeFile(join(ios, 'Splash.imageset', name), splash)
}
const android = join(root, 'android', 'app', 'src', 'main', 'res')
if (!splashOnly) for (const [density, size] of Object.entries({ mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })) {
  const directory = join(android, `mipmap-${density}`)
  const icon = await sharp(launcherIcon).resize(size, size).png().toBuffer()
  await writeFile(join(directory, 'ic_launcher.png'), icon)
  await writeFile(join(directory, 'ic_launcher_round.png'), icon)
  await writeFile(join(directory, 'ic_launcher_foreground.png'), icon)
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
console.log(splashOnly ? 'Generated branded UpCatch splash assets only' : 'Generated launcher icons from appIcon.png, plus UpCatch splash and notification assets')
