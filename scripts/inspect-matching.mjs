import { Client } from 'pg'
import { databaseConfig } from './database-client.mjs'
try { process.loadEnvFile('.env.local') } catch {}
const client=new Client(databaseConfig())
try {
 await client.connect()
 const totals=(await client.query(`select count(*)::int queued,
   count(*) filter(where expires_at>now())::int active,
   count(*) filter(where expires_at<=now())::int expired,
   count(*) filter(where expires_at>now() and not exists(select 1 from private.member_settings s where s.user_id=q.user_id and s.approx_lat is not null and s.approx_lon is not null))::int missing_location
   from private.match_queue q`)).rows[0]
 const intents=(await client.query('select intent,count(*)::int queued from private.match_queue where expires_at>now() group by intent order by intent')).rows
 const pairs=(await client.query(`select count(*)::int same_city_activity,
   count(*) filter(where private.pair_preferences_allow(a.user_id,b.user_id,a.city_id))::int compatible,
   count(*) filter(where private.pair_preferences_allow(a.user_id,b.user_id,a.city_id) and
     not exists(select 1 from private.match_cooldowns c where c.first_id=a.user_id and c.second_id=b.user_id and c.expires_at>now()))::int ready
   from private.match_queue a join private.match_queue b on a.user_id<b.user_id and a.city_id=b.city_id and a.intent=b.intent
   where a.expires_at>now() and b.expires_at>now()`)).rows[0]
 const offers=(await client.query(`select count(*)::int pending_offers from public.meetups m join private.meetup_details d on d.meetup_id=m.id where m.status='draft' and d.proposal_expires_at>now()`)).rows[0]
 console.log(JSON.stringify({queue:totals,activities:intents,pairs,...offers},null,2))
}catch(error){console.error('Matching inspection failed; SQLSTATE '+(error.code??'unknown'));process.exitCode=1}
finally{await client.end().catch(()=>{})}
