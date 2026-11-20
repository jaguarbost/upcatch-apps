'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PrimaryButton } from '@/components/upcatch/primitives'
import { photoCrop } from '@/lib/photo-crop'

export function PhotoCrop({ file, onCancel, onConfirm }: {
  file: File
  onCancel: () => void
  onConfirm: (file: File) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const image = useRef<HTMLImageElement>(null)
  const drag = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null)
  const working = useRef(false)
  const [source, setSource] = useState('')
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [zoom, setZoom] = useState(1)
  const [position, setPosition] = useState({ x: 0.5, y: 0.5 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const url = URL.createObjectURL(file)
    setSource(url)
    dialog.current?.showModal()
    return () => URL.revokeObjectURL(url)
  }, [file])
  const crop = photoCrop(dimensions.width, dimensions.height, zoom, position.x, position.y)
  async function confirm() {
    if (!image.current || !crop.size || working.current) return
    working.current = true
    setBusy(true); setError('')
    try {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = Math.max(100, Math.min(1024, Math.round(crop.size)))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Your browser could not crop this photo. Please try another browser.')
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image.current, crop.x, crop.y, crop.size, crop.size, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9))
      if (!blob) throw new Error('This photo could not be cropped. Please try again.')
      onConfirm(new File([blob], 'profile.jpg', { type: 'image/jpeg' }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This photo could not be cropped. Please try again.')
    } finally { working.current = false; setBusy(false) }
  }
  return createPortal(<dialog ref={dialog} aria-labelledby="photo-crop-title" aria-describedby="photo-crop-hint"
    onCancel={event => { event.preventDefault(); if (!working.current) onCancel() }}
    className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-sm overflow-y-auto rounded-3xl border border-border bg-card p-5 text-foreground shadow-xl backdrop:bg-black/60">
    <h2 id="photo-crop-title" className="font-display text-xl font-extrabold">Crop your photo</h2>
    <p id="photo-crop-hint" className="mt-2 text-sm text-muted-foreground">Drag to position your face, then adjust the zoom.</p>
    <div className="relative mt-4 aspect-square w-full touch-none overflow-hidden rounded-2xl bg-muted"
      onPointerDown={event => {
        if (busy || !crop.size) return
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { x: event.clientX, y: event.clientY, startX: position.x, startY: position.y }
      }}
      onPointerMove={event => {
        if (!drag.current || busy) return
        const scale = crop.size / event.currentTarget.getBoundingClientRect().width
        const clamp = (value: number) => Math.max(0, Math.min(1, value))
        setPosition({
          x: clamp(drag.current.startX - (event.clientX - drag.current.x) * scale / (dimensions.width - crop.size || 1)),
          y: clamp(drag.current.startY - (event.clientY - drag.current.y) * scale / (dimensions.height - crop.size || 1)),
        })
      }}
      onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
      {source && <img ref={image} src={source} alt="Photo crop preview" draggable={false}
        onLoad={event => setDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
        onError={() => setError('This photo could not be opened. Cancel and choose another photo.')}
        className="pointer-events-none absolute select-none"
        style={crop.size ? { maxWidth: 'none', width: `${dimensions.width / crop.size * 100}%`, height: `${dimensions.height / crop.size * 100}%`, left: `${-crop.x / crop.size * 100}%`, top: `${-crop.y / crop.size * 100}%` } : { visibility: 'hidden' }} />}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full border-2 border-white/80 shadow-[0_0_0_80px_rgba(0,0,0,0.35)]" />
    </div>
    <div className="mt-4 space-y-3">
      <label className="block text-sm font-semibold">Zoom<input className="mt-1 block w-full accent-primary" type="range" min="1" max="3" step="0.01" value={zoom} disabled={busy} onChange={event => setZoom(Number(event.target.value))} /></label>
      <label className="block text-sm font-semibold">Horizontal position<input className="mt-1 block w-full accent-primary" type="range" min="0" max="1" step="0.01" value={position.x} disabled={busy || dimensions.width === crop.size} onChange={event => setPosition(p => ({ ...p, x: Number(event.target.value) }))} /></label>
      <label className="block text-sm font-semibold">Vertical position<input className="mt-1 block w-full accent-primary" type="range" min="0" max="1" step="0.01" value={position.y} disabled={busy || dimensions.height === crop.size} onChange={event => setPosition(p => ({ ...p, y: Number(event.target.value) }))} /></label>
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    <div className="mt-5 flex gap-3">
      <PrimaryButton variant="soft" className="flex-1" disabled={busy} onClick={onCancel}>Cancel</PrimaryButton>
      <PrimaryButton className="flex-1" disabled={busy || !crop.size} onClick={confirm}>{busy ? 'Cropping…' : 'Use photo'}</PrimaryButton>
    </div>
  </dialog>, document.body)
}
