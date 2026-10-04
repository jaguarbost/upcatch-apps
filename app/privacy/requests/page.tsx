import { AccountShell } from '@/components/account/shell'
import { ActionForm } from '@/components/account/form'
import { requireMember } from '@/lib/server/member'
import { requestPrivacy } from './actions'
export const dynamic='force-dynamic'
export const metadata={title:'Your data rights',robots:{index:false,follow:false}}
export default async function Requests(){
 const {supabase}=await requireMember()
 const {data,error}=await supabase.rpc('my_privacy_requests')
 return <AccountShell title="Your data rights" description="Requests are reviewed by the UpCatch operator.">
 <ActionForm action={requestPrivacy} label="Submit request"><label className="block space-y-2 text-sm font-semibold"><span>Request type</span><select name="kind" required className="w-full rounded-xl border border-border bg-background px-4 py-3">{['access','portability','correction','erasure','restriction','objection'].map(kind=><option key={kind} value={kind}>{kind}</option>)}</select></label></ActionForm>
 <p className="text-sm text-muted-foreground">We will contact you using your account email to confirm details. You can submit one open request of each type.</p>
 {error?<p role="alert">Request history is temporarily unavailable.</p>:<ul className="space-y-2">{(data??[]).map((r:{id:string;kind:string;status:string;created_at:string})=><li key={r.id} className="rounded-xl bg-card p-3 text-sm">{r.kind} ? {r.status} ? {new Date(r.created_at).toLocaleDateString('en-GB')}</li>)}</ul>}
 </AccountShell>
}
