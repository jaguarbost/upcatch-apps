import { SiteStructuredData } from '@/components/upcatch/site-structured-data'
import { publicSiteOrigin } from '@/lib/seo'
import { UpCatchApp } from '@/components/upcatch/upcatch-app'
import { MemberApp } from '@/components/account/member-app'
import { createClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/config'
export const dynamic='force-dynamic'
export const metadata = { alternates: publicSiteOrigin() ? { canonical: publicSiteOrigin() + '/' } : undefined }

export default async function Page() {
  if(isSupabaseConfigured()){
    const supabase=await createClient()
    const {data,error}=await supabase.auth.getClaims()
    if(error && (error.name==='AuthRetryableFetchError' || (error.status??0)>=500))throw new Error('Sign-in is temporarily unavailable. Please try again shortly.')
    if(data?.claims)return <MemberApp />
  }
  return <><SiteStructuredData /><UpCatchApp /></>
}
