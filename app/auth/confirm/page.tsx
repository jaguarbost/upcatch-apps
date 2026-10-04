import Link from 'next/link'
import { cookies } from 'next/headers'
import { ActionForm } from '@/components/account/form'
import { AccountShell } from '@/components/account/shell'
import { confirmEmail } from '../actions'
export default async function ConfirmPage() {
  let type=''
  try {type=JSON.parse((await cookies()).get('upcatch-confirmation')?.value??'{}').type??''} catch {}
  return <AccountShell title={type==='recovery'?'Reset your password':'Confirm your email'}
    description="Continue to securely finish the request you started.">
    {['signup','recovery','email_change'].includes(type)?
      <ActionForm action={confirmEmail} label="Continue" />:
      <p role="alert">This confirmation session has expired. Open your email link again or request a new one.</p>}
    <Link href={type==='recovery'?'/auth/forgot-password':'/auth/check-email'} className="block text-sm text-primary">Request a new link</Link>
  </AccountShell>
}
