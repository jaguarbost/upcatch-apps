import Link from 'next/link'
import { ActionForm } from '@/components/account/form'
import { AccountShell } from '@/components/account/shell'
import { acceptTerms } from '../actions'

export default function AcceptTermsPage(){
  return <AccountShell title="Before you continue" description="Please review and accept the Terms of use for your UpCatch account.">
    <ActionForm action={acceptTerms} label="Agree and continue">
      <label className="flex items-start gap-3 text-sm leading-relaxed"><input type="checkbox" name="accept_terms" required className="mt-1 size-4 accent-primary" /><span>I agree to the <Link href="/terms" className="font-bold text-primary underline">Terms of use</Link>, including the public-venue safety guidance.</span></label>
    </ActionForm>
  </AccountShell>
}
