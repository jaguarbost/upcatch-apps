import { test } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { normalizePhoto, MAX_PHOTO_BYTES } from '../lib/server/image.ts'
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
