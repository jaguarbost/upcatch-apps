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
  console.log(JSON.stringify({
    preferences: preferences.rows[0],
    jobsLastSevenDays: jobs.rows,
    pendingOrFailedPushErrors: errors.rows,
    pushQueue: pushQueue.rows,
  }, null, 2))
} catch (error) {
  console.error(error.code ? `Push diagnostics failed: SQLSTATE ${error.code}` : error.message)
  process.exitCode = 1
} finally {
  await client.end().catch(() => undefined)
}
