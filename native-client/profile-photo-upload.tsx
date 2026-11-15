import { useEffect, useRef, useState } from 'react'
import { PrimaryButton } from '@/components/upcatch/primitives'
import { prepareProfilePhoto } from '@/lib/prepare-profile-photo'
import { uploadPhoto } from './onboarding-actions'

export function PhotoUpload() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const selection = useRef(0)
  const saving = useRef(false)
  const camera = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  async function select(next?: File) {
    if (!next || saving.current) return
    const version = ++selection.current
    setPreparing(true); setError(''); setMessage('')
    try {
      const prepared = await prepareProfilePhoto(next)
      if (version === selection.current) setFile(prepared)
    } catch (cause) {
      if (version === selection.current) { setFile(null); setPreview(undefined); setError(cause instanceof Error ? cause.message : 'Choose another photo.') }
    } finally {
      if (version === selection.current) setPreparing(false)
    }
  }
  async function save() {
    if (!file || saving.current || preparing) return
    saving.current = true; setBusy(true); setError(''); setMessage('')
    try {
      const form = new FormData()
      form.set('photo', file)
      const result = await uploadPhoto({}, form)
      if (result.error) setError(result.error)
      else {
        setMessage('Photo saved.')
        window.dispatchEvent(new Event('upcatch:native-reload'))
      }
    } catch {
      setError('We could not confirm the photo was saved. Please retry.')
    } finally { saving.current = false; setBusy(false) }
  }
  return <div className="space-y-5">
    {preview && <img src={preview} alt="Your selected photo" className="mx-auto size-36 rounded-full object-cover" />}
    <label className="block space-y-3 rounded-2xl border-2 border-dashed border-border bg-card p-5">
      <span className="block font-semibold">Choose a clear photo of yourself</span>
      <span className="block text-sm text-muted-foreground">JPEG, PNG or WebP. We resize your photo before uploading.</span>
      <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || preparing} onChange={event => { void select(event.target.files?.[0]); event.target.value = '' }} className="w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:p-2" />
    </label>
    <input ref={camera} type="file" accept="image/jpeg,image/png,image/webp" capture="user" disabled={busy || preparing} aria-label="Take a profile photo" className="sr-only" onChange={event => { void select(event.target.files?.[0]); event.target.value = '' }} />
    <button type="button" disabled={busy || preparing} onClick={() => camera.current?.click()} className="press min-h-11 w-full text-sm font-semibold text-primary disabled:opacity-50">Take a photo instead</button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {message && <p role="status" className="text-sm text-primary">{message}</p>}
    <PrimaryButton onClick={() => void save()} disabled={!file || busy || preparing} className="w-full">{preparing ? 'Preparing photo…' : busy ? 'Saving photo…' : 'Save photo'}</PrimaryButton>
  </div>
}
