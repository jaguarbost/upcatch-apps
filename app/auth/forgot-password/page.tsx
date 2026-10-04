import { ActionForm, Field } from '@/components/account/form'
import { AccountShell } from '@/components/account/shell'
import { requestReset } from '../actions'
export default function ForgotPage() {
  return <AccountShell title="Forgot your password?" description="We'll send you a link to choose a new one.">
    <ActionForm action={requestReset} label="Send reset link"><Field label="Email" name="email" type="email" required autoComplete="email" /></ActionForm>
  </AccountShell>
}
