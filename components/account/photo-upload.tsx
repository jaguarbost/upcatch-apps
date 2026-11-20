'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PrimaryButton } from '@/components/upcatch/primitives'
import { prepareProfilePhoto } from '@/lib/prepare-profile-photo'
import { uploadPhoto } from '@/app/onboarding/actions'
import { Camera } from 'lucide-react'
import { PhotoCrop } from './photo-crop'
export function PhotoUpload({ compact = false }: { compact?: boolean }) {
  const router=useRouter()
  const [file,setFile]=useState<File|null>(null),[preview,setPreview]=useState<string>(),[busy,setBusy]=useState(false),[preparing,setPreparing]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
  const selection=useRef(0),saving=useRef(false)
  const input=useRef<HTMLInputElement>(null)
  const [cropFile,setCropFile]=useState<File|null>(null)
  useEffect(()=>{if(!file)return;const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url)},[file])
  useEffect(()=>{if(!message)return;const timer=window.setTimeout(()=>setMessage(''),4000);return()=>window.clearTimeout(timer)},[message])
  async function select(file?:File){
    if(!file||saving.current)return
    const version=++selection.current;setPreparing(true);setError('');setMessage('')
    try{const prepared=await prepareProfilePhoto(file);if(version===selection.current)setCropFile(prepared)}
    catch(e){if(version===selection.current)setError(e instanceof Error?e.message:'Choose another photo.')}
    finally{if(version===selection.current)setPreparing(false)}
  }
  async function save(selected=file){
    if(!selected||saving.current||preparing)return
    saving.current=true;setBusy(true);setError('');setMessage('')
    try{const form=new FormData();form.set('photo',selected);const result=await uploadPhoto({},form);if(result.error)setError(result.error);else{setFile(null);setMessage('Photo saved.');router.refresh()}}
    catch{setError('We could not confirm the photo was saved. Your selected photo is still here; please retry.')}
    finally{saving.current=false;setBusy(false)}
  }
  return <div className={compact?'':'space-y-5'}>
    {compact && <button type="button" aria-label="Change profile photo" title="Change profile photo" disabled={busy||preparing} onClick={()=>input.current?.click()} className="press grid size-11 place-items-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow-md disabled:opacity-50"><Camera className="size-5" aria-hidden="true" /></button>}
    {!compact&&preview&&file&&<img src={preview} alt="Your selected photo" className="mx-auto size-36 rounded-full object-cover"/>}
    <label className={compact?'sr-only':'block space-y-3 rounded-2xl border-2 border-dashed border-border bg-card p-5'}>
      <span className="block font-semibold">Choose a clear photo of yourself</span>
      <span className="block text-sm text-muted-foreground">JPEG, PNG or WebP. We resize your photo before uploading.</span>
      <input ref={input} type="file" tabIndex={compact?-1:undefined} accept="image/jpeg,image/png,image/webp" disabled={busy||preparing} onChange={e=>{void select(e.target.files?.[0]);e.target.value=''}} className="w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:p-2"/>
    </label>
    <div className={compact?'absolute left-1/2 top-full z-10 mt-2 w-64 -translate-x-1/2 rounded-xl bg-card text-center shadow-sm':''}>
      {error&&<p role="alert" className="p-2 text-sm text-destructive">{error}</p>}
      {(message||compact&&(busy||preparing))&&<p role="status" className="p-2 text-sm text-primary">{preparing?'Preparing photo…':busy?'Saving photo…':message}</p>}
      {(!compact||file&&!busy)&&<PrimaryButton onClick={()=>void save()} disabled={!file||busy||preparing} className="w-full">{preparing?'Preparing photo…':busy?'Saving photo…':compact?'Retry saving photo':'Save photo'}</PrimaryButton>}
    </div>
    {cropFile&&<PhotoCrop file={cropFile} onCancel={()=>setCropFile(null)} onConfirm={cropped=>{setFile(cropped);setCropFile(null);if(compact)void save(cropped)}}/>}
  </div>
}
