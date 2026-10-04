import { UpCatchApp } from '@/components/upcatch/upcatch-app'
import { requireMember } from '@/lib/server/member'
import { loadLiveBootstrap } from '@/lib/server/live-bootstrap'

export async function MemberApp() {
  const { supabase, profile } = await requireMember()
  const initial = await loadLiveBootstrap(supabase, profile)
  return <UpCatchApp key={profile.id + ':' + Boolean(profile.onboarding_completed_at)} initial={initial} />
}
