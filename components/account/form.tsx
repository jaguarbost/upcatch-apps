'use client'
import { useActionState, type ReactNode } from 'react'
import { PrimaryButton } from '@/components/upcatch/primitives'
import type { FormState } from '@/lib/forms'
export function ActionForm({ action, children, label, className = '' }: {
  action: (state: FormState, form: FormData) => Promise<FormState>
  children?: ReactNode; label: string; className?: string
}) {
  const [state, formAction, pending] = useActionState(action, {})
  return <form action={formAction} className={'space-y-5 ' + className}>
    <fieldset disabled={pending} className="space-y-5">{children}
      {state.error && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{state.error}</p>}
      {state.message && <p role="status" className="rounded-xl bg-primary/10 p-3 text-sm text-primary">{state.message}</p>}
      <PrimaryButton type="submit" className="w-full" disabled={pending}>
        {pending ? 'Please wait…' : label}
      </PrimaryButton>
    </fieldset>
  </form>
}
export function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="block space-y-2 text-sm font-semibold"><span>{label}</span>
    <input {...props} className="w-full rounded-xl border border-border bg-background px-4 py-3 outline-none focus:ring-2 focus:ring-primary" />
  </label>
}
