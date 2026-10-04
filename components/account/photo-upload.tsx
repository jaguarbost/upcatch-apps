'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PrimaryButton } from '@/components/upcatch/primitives'
import { prepareProfilePhoto } from '@/lib/prepare-profile-photo'
import { uploadPhoto } from '@/app/onboarding/actions'
export function PhotoUpload() {
  const router=useRouter()
  const [file,setFile]=useState<File|null>(null),[preview,setPreview]=useState<string>(),[busy,setBusy]=useState(false),[preparing,setPreparing]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
  const selection=useRef(0),saving=useRef(false)
  useEffect(()=>{if(!file)return;const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url)},[file])
  async function select(file?:File){
    if(!file||saving.current)return
    const version=++selection.current;setPreparing(true);setError('');setMessage('')
    try{const prepared=await prepareProfilePhoto(file);if(version===selection.current)setFile(prepared)}
    catch(e){if(version===selection.current)setError(e instanceof Error?e.message:'Choose another photo.')}
    finally{if(version===selection.current)setPreparing(false)}
  }
  async function save(){
    if(!file||saving.current||preparing)return
    saving.current=true;setBusy(true);setError('');setMessage('')
    try{const form=new FormData();form.set('photo',file);const result=await uploadPhoto({},form);if(result.error)setError(result.error);else{setMessage('Photo saved.');router.refresh()}}
    catch{setError('We could not confirm the photo was saved. Your selected photo is still here; please retry.')}
    finally{saving.current=false;setBusy(false)}
  }
  return <div className="space-y-5">
    {preview&&<img src={preview} alt="Your selected photo" className="mx-auto size-36 rounded-full object-cover"/>}
    <label className="block space-y-3 rounded-2xl border-2 border-dashed border-border bg-card p-5">
      <span className="block font-semibold">Choose a clear photo of yourself</span>
      <span className="block text-sm text-muted-foreground">JPEG, PNG or WebP. We resize your photo before uploading.</span>
      <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||preparing} onChange={e=>{void select(e.target.files?.[0]);e.target.value=''}} className="w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:p-2"/>
    </label>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    {message&&<p role="status" className="text-sm text-primary">{message}</p>}
    <PrimaryButton onClick={save} disabled={!file||busy||preparing} className="w-full">{preparing?'Preparing photo?':busy?'Saving photo?':'Save photo'}</PrimaryButton>
  </div>
}
