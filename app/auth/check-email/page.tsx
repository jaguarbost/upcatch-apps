import Link from 'next/link'
import { ActionForm, Field } from '@/components/account/form'
import { AccountShell } from '@/components/account/shell'
import { resendConfirmation } from '../actions'
export default function CheckEmailPage() {
  return <AccountShell title="Check your inbox" description="Open the confirmation email to verify your address before adding your profile. Check spam too.">
    <ActionForm action={resendConfirmation} label="Resend confirmation">
      <Field label="Your email" name="email" type="email" autoComplete="email" required />
    </ActionForm>
    <Link href="/auth/login" className="block font-bold text-primary">Back to sign in</Link>
  </AccountShell>
}
