import { redirect } from 'next/navigation'
import { AccountShell } from '@/components/account/shell'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { requireMember } from '@/lib/server/member'
export const dynamic = 'force-dynamic'
export default async function Page() {
  if (!isSupabaseConfigured()) return <AccountShell title="UpCatch is getting ready" description="We're preparing the Manchester launch. Please check back soon.">
    {process.env.NODE_ENV !== 'production' && <p className="rounded-xl bg-card p-4 text-sm">Developer setup: follow docs/setup.md to configure Supabase and apply the database migrations.</p>}
  </AccountShell>
  const { supabase, profile } = await requireMember()
  const {data:adult,error}=await supabase.rpc('my_birth_eligibility')
  if(error)throw new Error('Your onboarding status could not be loaded. Please retry.')
  redirect(profile.onboarding_completed_at && adult ? '/' : '/onboarding')
}
