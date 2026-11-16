import sharp from 'sharp'
import { mkdir, stat } from 'node:fs/promises'

await mkdir('public/onboarding', { recursive: true })
let before = 0, after = 0
for (const step of [1, 2, 3]) {
  const source = `howitworks/${step}.png`
  const target = `public/onboarding/how-it-works-${step}.webp`
  // Retain the complete supplied artwork and original dimensions.
  await sharp(source).webp({ quality: 82, effort: 6, smartSubsample: true }).toFile(target)
  const original = await stat(source), compressed = await stat(target)
  before += original.size; after += compressed.size
  console.log(`${target}: ${compressed.size} bytes (original ${original.size})`)
}
console.log(`Total: ${before} -> ${after} bytes; ${(100 * (1 - after / before)).toFixed(1)}% smaller`)
