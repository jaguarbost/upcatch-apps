import sharp from 'sharp'
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024
export async function normalizePhoto(input: Uint8Array) {
  if (!input.byteLength || input.byteLength > MAX_PHOTO_BYTES) throw new Error('Choose an image under 5 MB.')
  const image = sharp(input, { limitInputPixels: 20_000_000, failOn: 'warning' })
  const metadata = await image.metadata()
  if (!['jpeg','png','webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) > 1)
    throw new Error('Choose a still JPEG, PNG or WebP image.')
  if (!metadata.width || !metadata.height || metadata.width < 100 || metadata.height < 100)
    throw new Error('Choose an image at least 100 × 100 pixels.')
  return image.rotate().resize(1024,1024,{ fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer()
}
