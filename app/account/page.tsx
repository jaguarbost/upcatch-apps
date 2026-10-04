export const dynamic = 'force-dynamic'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AccountShell } from '@/components/account/shell'
import { PhotoUpload } from '@/components/account/photo-upload'
import { PushSettings } from '@/components/account/push-settings'
import { requireMember } from '@/lib/server/member'
export default async function AccountPage() {
  const {supabase,user,profile}=await requireMember()
  if(!profile.onboarding_completed_at)redirect('/onboarding')
  const [{data:photo},{data:prefs},{data:access}]=await Promise.all([
    supabase.storage.from('profile-photos').createSignedUrl(profile.photo_path,600),
    supabase.from('notification_preferences').select('push_enabled').eq('user_id',user.id).single(),
    supabase.rpc('my_meetup_access'),
  ])
  const allowance=access?.[0]
  const {data:city}=profile.home_city_id?await supabase.from('cities').select('name').eq('id',profile.home_city_id).maybeSingle():{data:null}
  return <AccountShell title={'Hello, '+profile.display_name} description={city ? 'Your profile is ready for '+city.name+'.' : 'Your profile is ready.'}>
    {photo?.signedUrl && <img src={photo.signedUrl} alt="Your profile" className="size-28 rounded-full object-cover" />}
    <div className="rounded-2xl bg-card p-5">
      <p className="font-bold text-primary">Email confirmed</p><p className="mt-1 break-all text-sm text-muted-foreground">{user.email}</p>
      <p className="mt-4 text-sm">{allowance?.id_required?'ID review is required before your next meetup.':'ID upload is required after your first 3 completed meetups.'}</p>
      <p className="mt-2 text-sm text-muted-foreground">Completed meetups: {allowance?.completed_meetups??0}</p>
    </div>
    <Link href="/venues" className="block rounded-xl bg-primary p-4 text-center font-bold text-primary-foreground">Explore local venues</Link>
    <details className="rounded-2xl border border-border p-4"><summary className="cursor-pointer font-semibold">Change profile photo</summary><div className="mt-5"><PhotoUpload /></div></details>
    <PushSettings initialEnabled={prefs?.push_enabled??false} />
  </AccountShell>
}
