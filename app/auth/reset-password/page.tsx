import { ActionForm, Field } from '@/components/account/form'
import { AccountShell } from '@/components/account/shell'
import { resetPassword } from '../actions'
export default function ResetPage() {
  return <AccountShell title="Choose a new password">
    <ActionForm action={resetPassword} label="Save password"><Field label="New password" name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></ActionForm>
  </AccountShell>
}
