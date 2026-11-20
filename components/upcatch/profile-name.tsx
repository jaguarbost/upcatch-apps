'use client'

import { Pencil } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { PrimaryButton } from './primitives'

export function ProfileName({ name }: { name: string }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(name)
  const [savedName, setSavedName] = useState(name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const saving = useRef(false)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { setSavedName(name) }, [name])
  useEffect(() => { if (open) dialog.current?.showModal() }, [open])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (saving.current) return
    const nextName = draft.trim()
    if (!nextName || nextName.length > 80) { setError('Enter a name between 1 and 80 characters.'); return }
    saving.current = true; setBusy(true); setError('')
    try {
      // The existing RPC enforces the authenticated owner, confirmation and age.
      // Omitting city preserves the member's existing home city.
      const { error: saveError } = await createClient().rpc('save_profile', { p_name: nextName, p_adult: true })
      if (saveError) throw new Error('Your name could not be saved. Please retry.')
      setSavedName(nextName)
      setOpen(false)
      window.dispatchEvent(new Event('upcatch:native-reload'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your name could not be saved. Please retry.')
    } finally { saving.current = false; setBusy(false) }
  }

  return <>
    <button type="button" aria-label="Edit profile name" aria-haspopup="dialog" onClick={() => { setDraft(savedName); setError(''); setOpen(true) }} className="press inline-flex items-center gap-2 rounded-lg focus-visible:ring-2 focus-visible:ring-primary">
      {savedName}<Pencil className="size-4 text-primary" aria-hidden="true" />
    </button>
    {open && createPortal(<dialog ref={dialog} aria-labelledby="profile-name-title" onCancel={event => { event.preventDefault(); if (!saving.current) setOpen(false) }} className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-sm rounded-3xl border border-border bg-card p-5 text-base font-normal text-foreground shadow-xl backdrop:bg-black/60">
      <form onSubmit={save} className="space-y-4">
        <h2 id="profile-name-title" className="font-display text-xl font-extrabold">Edit your name</h2>
        <label className="block text-sm font-semibold">Name
          <input autoFocus required maxLength={80} value={draft} disabled={busy} onChange={event => setDraft(event.target.value)} autoComplete="name" className="mt-2 min-h-12 w-full rounded-2xl border border-border bg-background px-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
        </label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-3">
          <PrimaryButton variant="soft" disabled={busy} onClick={() => setOpen(false)} className="flex-1">Cancel</PrimaryButton>
          <PrimaryButton type="submit" disabled={busy || !draft.trim()} className="flex-1">{busy ? 'Saving…' : 'Save name'}</PrimaryButton>
        </div>
      </form>
    </dialog>, document.body)}
  </>
}
