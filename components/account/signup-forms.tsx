'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ActionForm, Field } from './form'
import { signUp, signUpWithGoogle } from '@/app/auth/actions'

export function SignupForms() {
  const [accepted, setAccepted] = useState(false)
  return <>
    <label className="flex items-start gap-3 text-sm leading-relaxed">
      <input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} className="mt-1 size-4 accent-primary" />
      <span>I agree to the <Link href="/terms" className="font-bold text-primary underline">Terms of use</Link>, including the public-venue safety guidance.</span>
    </label>
    <ActionForm action={signUpWithGoogle} label="Continue with Google" submitDisabled={!accepted}>
      {accepted && <input type="hidden" name="accept_terms" value="on" />}
    </ActionForm>
    <p className="text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Or continue with email</p>
    <ActionForm action={signUp} label="Create account" submitDisabled={!accepted}>
      {accepted && <input type="hidden" name="accept_terms" value="on" />}
      <Field label="Email" name="email" type="email" autoComplete="email" required maxLength={254} />
      <Field label="Password ? at least 12 characters" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} />
    </ActionForm>
  </>
}
