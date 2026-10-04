'use client'

// Resize before sending; the server still validates and re-encodes every image.
export async function prepareProfilePhoto(file: File): Promise<File> {
  if (!file.size || file.size > 20 * 1024 * 1024) throw new Error('Choose a photo under 20 MB.')
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG or WebP photo. If needed, export your photo as JPEG first.')
  const source = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = source
    try { await image.decode() } catch { throw new Error('This photo could not be opened. Please choose another image.') }
    if (image.naturalWidth < 100 || image.naturalHeight < 100) throw new Error('Choose a photo at least 100 ? 100 pixels.')
    if (image.naturalWidth * image.naturalHeight > 20_000_000) throw new Error('This photo is too large. Choose a smaller version.')
    const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(image.naturalWidth * scale)
    canvas.height = Math.round(image.naturalHeight * scale)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Your browser could not prepare this photo. Try another browser.')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    if (!blob || blob.size > 2 * 1024 * 1024) throw new Error('This photo could not be prepared. Please choose a smaller image.')
    return new File([blob], 'profile.jpg', { type: 'image/jpeg' })
  } finally { URL.revokeObjectURL(source) }
}
