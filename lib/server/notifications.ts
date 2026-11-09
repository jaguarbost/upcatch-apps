import 'server-only'
import { createHmac } from 'node:crypto'
import { adminClient } from '@/lib/supabase/admin'
import { siteUrl } from './member'
import { notificationEmail, type EmailPayload } from '@/lib/email/templates'
import { pushTTL } from '@/lib/push-expiry'
class ReplayExpired extends Error {}
async function beginDelivery(job: Job) {
  const {data,error}=await adminClient().rpc('begin_notification_delivery',{p_id:job.id,p_lease:job.lease_token})
  if(error)throw new Error('Could not record provider attempt')
  if(!data)throw new ReplayExpired('Provider replay window expired; manual review required')
}
type Job = { id: string; user_id: string; kind: 'welcome_email' | 'paired_email' | 'feedback_email' | 'welcome_push' | 'meetup_push' | 'trusted_email' | 'friend_push'; payload?: EmailPayload; lease_token: string; created_at: string }
export function pushAlias(userId: string) {
  const secret = process.env.ONESIGNAL_ALIAS_SECRET
  if (!secret || secret.length < 32) throw new Error('Push alias secret must have at least 32 characters.')
  // Web SDK does not currently support OneSignal JWT identity verification.
  // Use an unguessable per-member alias, never the public account UUID.
  return createHmac('sha256', secret).update(userId).digest('hex')
}
async function deliver(job: Job): Promise<'sent' | 'skipped'> {
  const admin = adminClient()
  const { data: { user }, error } = await admin.auth.admin.getUserById(job.user_id)
  if(error) throw new Error('Notification recipient unavailable')
  if(!user?.email_confirmed_at) return 'skipped'
  if(job.payload?.expires_at && Date.parse(job.payload.expires_at)<=Date.now())return 'skipped'
  if(job.kind === 'welcome_email' || job.kind === 'paired_email' || job.kind === 'feedback_email' || job.kind === 'trusted_email') {
    if(job.kind === 'paired_email') {
      if(!job.payload?.meetup_id) return 'skipped'
      const {data:meetup,error:meetupError}=await admin.from('meetups').select('status,ends_at').eq('id',job.payload.meetup_id).maybeSingle()
      if(meetupError) throw new Error('Meetup details unavailable')
      if(!meetup || meetup.status!=='confirmed' || Date.parse(meetup.ends_at)<=Date.now()) return 'skipped'
    }
    if(job.kind === 'feedback_email') {
      if(!job.payload?.meetup_id) return 'skipped'
      const {data:meetup,error:meetupError}=await admin.from('meetups').select('status').eq('id',job.payload.meetup_id).maybeSingle()
      if(meetupError) throw new Error('Meetup details unavailable')
      if(meetup?.status!=='completed') return 'skipped'
    }
    if(!process.env.RESEND_API_KEY) throw new Error('Email delivery not configured')
    const email = notificationEmail(job.kind, siteUrl(), job.payload)
    await beginDelivery(job)
    const result = await fetch('https://api.resend.com/emails', {
      method:'POST', signal:AbortSignal.timeout(8000),
      headers:{ Authorization:'Bearer '+process.env.RESEND_API_KEY, 'Content-Type':'application/json', 'Idempotency-Key':job.id },
      body:JSON.stringify({from:process.env.EMAIL_FROM || 'UpCatch <hello@upcatch.uk>',to:[job.kind==='trusted_email'?job.payload?.to:user.email],
        ...email}),
    })
    if(!result.ok) throw new Error('Email provider returned '+result.status)
    return 'sent'
  }
  if(job.payload?.route==='wall' && job.payload.post_id) {
    const {data:active,error:postError}=await admin.rpc('scheduled_post_push_active',{p_post:job.payload.post_id})
    if(postError) throw new Error('Scheduled post unavailable')
    if(!active) return 'skipped'
  }
  if(job.payload?.route==='nudges') {
    if(!job.payload.nudge_id) return 'skipped'
    const {data:active,error:nudgeError}=await admin.rpc('friend_nudge_push_active',{p_nudge:job.payload.nudge_id})
    if(nudgeError) throw new Error('Friend nudge unavailable')
    if(!active) return 'skipped'
  }
  if(job.payload?.route==='messages') {
    if(!job.payload.message_id || !['live','scheduled','friend'].includes(job.payload.chat ?? '')) return 'skipped'
    const {data:active,error:chatError}=await admin.rpc('chat_message_push_active',{
      p_chat:job.payload.chat,p_message:job.payload.message_id,p_recipient:job.user_id,
    })
    if(chatError) throw new Error('Message unavailable')
    if(!active) return 'skipped'
  }
  const {data:prefs,error:prefsError}=await admin.from('notification_preferences').select('push_enabled').eq('user_id',job.user_id).single()
  if(prefsError) throw new Error('Push preferences unavailable')
  if(!prefs?.push_enabled) return 'skipped'
  if(!process.env.ONESIGNAL_API_KEY || !process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID) throw new Error('Push delivery not configured')
  await beginDelivery(job)
  const ttl=pushTTL(job.payload?.expires_at)
  if(ttl===0)return 'skipped'
  const result = await fetch('https://api.onesignal.com/notifications', {
    method:'POST',signal:AbortSignal.timeout(8000),
    headers:{Authorization:'Key '+process.env.ONESIGNAL_API_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({app_id:process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID,
      include_aliases:{external_id:[pushAlias(job.user_id)]},target_channel:'push',idempotency_key:job.id,
      headings:{en:job.payload?.title??'Welcome to UpCatch'},contents:{en:job.payload?.text??'Your profile is ready. Say hello to someone new.'},
      web_url:siteUrl()+'/app?view=notifications',
      app_url:'uk.co.upcatch.app://app/notifications',
      data:{route:'notifications'},small_icon:'ic_stat_upcatch',android_accent_color:'2B59FF',ttl}),
  })
  if(!result.ok) throw new Error('Push provider returned '+result.status)
  const body=await result.json()
  if(!body.id) throw new Error('No subscribed device was available')
  return 'sent'
}
export async function deliverNotifications(userId?: string) {
  const admin=adminClient()
  const {data,error}=await admin.rpc('claim_notification_jobs',{p_limit:userId?2:5,p_user:userId??null})
  if(error) throw new Error('Could not claim notification jobs')
  let sent=0
  await Promise.all((data as Job[] ?? []).map(async job=>{
    let state: 'sent'|'skipped'|'pending'|'failed'='pending'
    let reason: string|null=null
    try { state=await deliver(job); if(state==='sent')sent++ }
    catch(error) { reason=error instanceof Error?error.message:'Delivery failed'; if(error instanceof ReplayExpired)state='failed' }
    const {error:finishError}=await admin.rpc('finish_notification_job',{p_id:job.id,p_lease:job.lease_token,p_state:state,p_error:reason})
    if(finishError) throw new Error('Could not record notification outcome')
  }))
  return {processed:data?.length??0,sent}
}

export async function deliverMemberNotifications(userId: string) {
  const {data,error}=await adminClient().rpc('notification_recipients',{p_user:userId})
  if(error)throw new Error('Notification recipients unavailable')
  const recipients=[...new Set<string>((data??[]).map((row:{user_id:string})=>row.user_id))]
  await Promise.all(recipients.map(id=>deliverNotifications(id)))
}
