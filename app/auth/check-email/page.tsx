import Link from 'next/link'
import { cookies } from 'next/headers'
import { ResendConfirmation } from '@/components/account/resend-confirmation'
import { ActionForm, Field } from '@/components/account/form'
import { AccountShell } from '@/components/account/shell'
import { resendConfirmation } from '../actions'
export default async function CheckEmailPage() {
  const pending=await cookies()
  const hasEmail=Boolean(pending.get('upcatch-pending-email')?.value)
  const sentAt=Number(pending.get('upcatch-confirmation-sent-at')?.value || 0)
  const initialSeconds=Math.max(0,Math.ceil((sentAt+60_000-Date.now())/1000))
  return <AccountShell title="Check your inbox" description="Open the confirmation email to verify your address before adding your profile. Check spam too.">
    {hasEmail ? <ResendConfirmation sentAt={sentAt} initialSeconds={initialSeconds} /> :
      <ActionForm action={resendConfirmation} label="Resend confirmation">
        <Field label="Your email" name="email" type="email" autoComplete="email" required />
      </ActionForm>}
    <Link href="/auth/login" className="block font-bold text-primary">Back to sign in</Link>
  </AccountShell>
}
