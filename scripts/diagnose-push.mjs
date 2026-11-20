// Read-only hosted push overview. Never print member IDs, aliases, or credentials.
import { Client } from 'pg'
import { databaseConfig } from './database-client.mjs'

try { process.loadEnvFile('.env.local') } catch {}
const client = new Client(databaseConfig())
try {
  await client.connect()
  const preferences = await client.query(`
    select count(*)::int as members,
           count(*) filter (where push_enabled)::int as push_enabled
    from public.notification_preferences`)
  const jobs = await client.query(`
    select kind, state, count(*)::int as jobs,
           max(created_at) as latest_created
    from private.notification_jobs
    where created_at >= now() - interval '7 days'
    group by kind, state order by kind, state`)
  const errors = await client.query(`
    select case
      when last_error like 'Push provider returned %' then last_error
      when last_error = 'No subscribed device was available' then last_error
      when last_error = 'Push delivery not configured' then last_error
      when last_error = 'Provider replay window expired; manual review required' then last_error
      when last_error is null then 'none'
      else 'other'
    end as category, count(*)::int as jobs
    from private.notification_jobs
    where created_at >= now() - interval '7 days'
      and kind in ('welcome_push','meetup_push','friend_push')
      and state in ('pending','failed')
    group by category order by jobs desc`)
  const pushQueue = await client.query(`
    select j.kind, j.state, count(*)::int as jobs,
           count(*) filter (where j.next_attempt_at <= now())::int as due,
           count(*) filter (where j.payload ? 'expires_at'
             and (j.payload->>'expires_at')::timestamptz <= now())::int as expired,
           count(*) filter (where p.push_enabled)::int as recipient_enabled,
           max(j.attempts)::int as max_attempts,
           max(j.created_at) as latest_created
    from private.notification_jobs j
    left join public.notification_preferences p on p.user_id = j.user_id
    where j.created_at >= now() - interval '7 days'
      and j.kind in ('welcome_push','meetup_push','friend_push')
      and j.state in ('pending','failed')
    group by j.kind, j.state order by j.kind, j.state`)
  const nudges = await client.query(`
    select count(*)::int as requests,
           count(*) filter (where n.dismissed_at is null)::int as open_requests,
           count(*) filter (where p.push_enabled)::int as recipients_currently_enabled,
           count(*) filter (where j.id is null)::int as without_push_job,
           max(n.created_at) as latest_created
    from private.friend_nudges n
    left join public.notification_preferences p on p.user_id = n.recipient_id
    left join private.notification_jobs j on j.payload->>'nudge_id' = n.id::text
    where n.created_at >= now() - interval '7 days'`)
  const nudgeJobs = await client.query(`
    select state, case
      when last_error like 'Push provider returned %' then last_error
      when last_error = 'No subscribed device was available' then last_error
      when last_error = 'Push delivery not configured' then last_error
      when last_error is null then 'none' else 'other'
    end as error_category, count(*)::int as jobs,
    max(created_at) as latest_created, max(attempts)::int as max_attempts
    from private.notification_jobs
    where payload ? 'nudge_id' and created_at >= now() - interval '7 days'
    group by state, error_category order by latest_created desc`)
  const recentNudges = await client.query(`
    select n.created_at, n.dismissed_at is not null as dismissed,
      coalesce(p.push_enabled, false) as recipient_push_enabled,
      private.nudge_friend_eligible(n.sender_id, n.recipient_id) as currently_eligible,
      j.state as push_state,
      exists(select 1 from public.member_notifications inbox
        where inbox.user_id = n.recipient_id and inbox.peer_id = n.sender_id
          and inbox.created_at >= n.created_at - interval '1 second'
          and inbox.created_at <= n.created_at + interval '1 second') as inbox_entry_exists
    from private.friend_nudges n
    left join public.notification_preferences p on p.user_id = n.recipient_id
    left join private.notification_jobs j on j.payload->>'nudge_id' = n.id::text
    order by n.created_at desc limit 5`)
  const nudgeTrigger = await client.query(`
    select t.tgenabled = 'O' as enabled,
      position('push_enabled' in pg_get_functiondef(t.tgfoid)) > 0 as requires_push_opt_in
    from pg_trigger t where t.tgrelid = 'private.friend_nudges'::regclass
      and t.tgname = 'queue_friend_nudge'`)
  console.log(JSON.stringify({
    preferences: preferences.rows[0],
    jobsLastSevenDays: jobs.rows,
    pendingOrFailedPushErrors: errors.rows,
    pushQueue: pushQueue.rows,
    nudgesLastSevenDays: nudges.rows[0],
    nudgePushJobs: nudgeJobs.rows,
    latestNudges: recentNudges.rows,
    nudgeTrigger: nudgeTrigger.rows,
  }, null, 2))
} catch (error) {
  console.error(error.code ? `Push diagnostics failed: SQLSTATE ${error.code}` : error.message)
  process.exitCode = 1
} finally {
  await client.end().catch(() => undefined)
}
