export type Member = {
  id: string; display_name: string; email: string; city: string | null
  completed_meetups: number; reserved_meetups: number; id_status: string
  remaining: number | null; subscription_status: string; entitlement_version: number
}
export type Dashboard = {
  stats: Record<'members' | 'online' | 'meetups' | 'completed' | 'active_subscriptions' | 'pending_emails' | 'failed_emails', number>
  members: Member[]; member_count: number
  meetups: { id: string; status: string; creation_type: string; starts_at: string; ends_at: string; city: string; venue: string | null; members: string | null }[]
  online: { id: string; display_name: string; city: string; state: string; since: string }[]
  audit: { id: number; user_id: string; display_name: string | null; reason: string; created_at: string; actor: string; after_value: { meetup_limit: number | null; subscription_status: string } }[]
}
export type EmailPreview = { name: string; subject: string; html: string }
export type ActionState = { error?: string; success?: string }
