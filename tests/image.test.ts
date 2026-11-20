import { test } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { normalizePhoto, MAX_PHOTO_BYTES } from '../lib/server/image.ts'
import { photoCrop } from '../lib/photo-crop.ts'

test('portrait and landscape crops match the visible square at centre and edges', () => {
  assert.deepEqual(photoCrop(800, 1200, 1, 0.5, 0.5), { size: 800, x: 0, y: 200 })
  assert.deepEqual(photoCrop(1200, 800, 2, 1, 0), { size: 400, x: 800, y: 0 })
  assert.deepEqual(photoCrop(900, 900, 3, 0.5, 0.5), { size: 300, x: 300, y: 300 })
})

test('crop positions stay inside the source image at every zoom', () => {
  for (const [width, height] of [[800, 1200], [1200, 800], [100, 100]]) {
    for (const zoom of [0, 1, 1.5, 2, 3, 4]) {
      for (const position of [-1, 0, 0.5, 1, 2]) {
        const crop = photoCrop(width, height, zoom, position, position)
        assert.ok(crop.size > 0)
        assert.ok(crop.x >= 0 && crop.y >= 0)
        assert.ok(crop.x + crop.size <= width && crop.y + crop.size <= height)
      }
    }
  }
})
test('re-encodes a real image, strips metadata and bounds dimensions',async()=>{
  const input=await sharp({create:{width:2048,height:1200,channels:3,background:'blue'}}).withMetadata().png().toBuffer()
  const result=await normalizePhoto(input)
  const meta=await sharp(result).metadata()
  assert.equal(meta.format,'jpeg');assert.equal(meta.width,1024);assert.ok(!meta.exif)
})
test('rejects disguised non-image content',async()=>{await assert.rejects(()=>normalizePhoto(Buffer.from('<svg></svg>')))})
test('rejects oversized input before decoding',async()=>{await assert.rejects(()=>normalizePhoto(new Uint8Array(MAX_PHOTO_BYTES+1)))})
test('rejects unusably tiny images',async()=>{
  const input=await sharp({create:{width:10,height:10,channels:3,background:'white'}}).png().toBuffer()
  await assert.rejects(()=>normalizePhoto(input))
})

for (const format of ['jpeg', 'png', 'webp'] as const) {
  test('preserves supported ' + format + ' photo uploads', async () => {
    const input = await sharp({create:{width:100,height:100,channels:3,background:'blue'}}).toFormat(format).toBuffer()
    assert.equal((await sharp(await normalizePhoto(input)).metadata()).format, 'jpeg')
  })
}
