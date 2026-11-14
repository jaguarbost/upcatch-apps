import { ActionForm, Field } from '@/components/account/form'
import { AccountShell } from '@/components/account/shell'
import { requestReset } from '../actions'
export default async function ForgotPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  const expired = Boolean((await searchParams).expired)
  return <AccountShell title="Forgot your password?" description="We'll send you a link to choose a new one.">
    {expired && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">That reset link has expired or was already used. Request a new link below.</p>}
    <ActionForm action={requestReset} label="Send reset link"><Field label="Email" name="email" type="email" required autoComplete="email" /></ActionForm>
  </AccountShell>
}
