import { Client } from 'pg'
import { databaseConfig } from './database-client.mjs'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
try{process.loadEnvFile('.env.local')}catch{}
const client=new Client(databaseConfig())
let checks=0
const check=(value,label)=>{assert.ok(value,label);console.log('PASS '+label);checks++}
try{
 await client.connect()
 check(client.connection.stream.encrypted===true&&client.connection.stream.authorized===true,'Client-to-pooler TLS and certificate verification enabled')
 const migrations=(await client.query('select name,checksum from private.app_schema_migrations order by name')).rows
 const files=(await readdir('supabase/migrations')).filter(name=>name.endsWith('.sql'))
 for(const name of files){
  const checksum=createHash('sha256').update((await readFile('supabase/migrations/'+name,'utf8')).replace(/\r\n/g,'\n')).digest('hex')
  assert.equal(migrations.find(m=>m.name===name)?.checksum,checksum,'Migration checksum: '+name)
 }
 check(true,'All '+files.length+' current migration files recorded with matching checksums')
 const venues=(await client.query("select count(*)::int n from public.venues v join public.cities c on c.id=v.city_id where c.slug='manchester' and c.status='active'")).rows[0].n
 check(venues===20,'Manchester has 20 venues')
 const tables=(await client.query("select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname in ('member_settings','meetup_messages','member_blocks','meetup_reports','friendships','friend_votes','availability_details')")).rows
 check(tables.length===7&&tables.every(t=>t.relrowsecurity),'New member tables have RLS enabled')
 const nullable=(await client.query("select is_nullable from information_schema.columns where table_schema='private' and table_name='match_queue' and column_name='venue_id'")).rows[0]
 check(nullable?.is_nullable==='YES','Going online does not require a venue')
 const matcher=(await client.query("select pg_get_functiondef('public.meetup_command(text,uuid,text,integer,integer)'::regprocedure) body")).rows[0].body
 check(matcher.includes('Waiting for the first person to accept'),'Sequential acceptance enforced on hosted database')
 check(matcher.includes('q.audience'),'Mutual audience filter deployed')
 check(matcher.includes('member_blocks'),'Blocked peers excluded')
 check(matcher.includes('record_presence'),'Online/offline event recording deployed')
 const presence=(await client.query("select has_function_privilege('authenticated','public.my_presence_stats()','execute') stats,has_table_privilege('authenticated','private.presence_events','select') raw_events,has_table_privilege('service_role','private.presence_events','delete') delete_events")).rows[0]
 check(presence.stats&&!presence.raw_events&&!presence.delete_events,'Presence stats available privately; history cannot be erased through client APIs')
 const grants=(await client.query("select has_function_privilege('anon','public.send_meetup_message(text)','execute') anon_chat,has_function_privilege('authenticated','public.send_meetup_message(text)','execute') member_chat,has_table_privilege('authenticated','private.member_settings','select') raw_settings")).rows[0]
 check(!grants.anon_chat&&grants.member_chat&&!grants.raw_settings,'Chat and settings grants restrict access')
 const features=(await client.query("select has_function_privilege('authenticated','public.update_matching_search(text,integer,text)','execute') search,has_function_privilege('anon','public.update_matching_search(text,integer,text)','execute') anon_search,has_function_privilege('authenticated','public.my_profile_stats()','execute') metrics,has_function_privilege('anon','public.my_profile_stats()','execute') anon_metrics,has_function_privilege('authenticated','public.rate_meetup(uuid,integer)','execute') rating,has_function_privilege('anon','public.rate_meetup(uuid,integer)','execute') anon_rating,has_function_privilege('authenticated','private.pair_preferences_allow(uuid,uuid,uuid)','execute') private_pair")).rows[0]
 check(features.search&&features.metrics&&features.rating&&!features.anon_search&&!features.anon_metrics&&!features.anon_rating&&!features.private_pair,'Dynamic search, metrics and rating RPCs restricted to members')
 const wrapper=(await client.query("select pg_get_functiondef('public.my_live_state()'::regprocedure) body")).rows[0].body
 check(wrapper.includes("meetup_command('retry')")&&wrapper.includes('profile_stats'),'Polling retries matching and refreshes profile statistics')
 check(matcher.includes('pair_preferences_allow')&&!matcher.includes('No public venues are available'),'Pairing checks mutual preferences without requiring a venue')
 await client.query("notify pgrst, 'reload schema'")
 console.log(checks+' hosted schema checks passed; PostgREST schema reload requested')
}catch(error){console.error(error.code?'Hosted verification failed; SQLSTATE '+error.code:error.message);process.exitCode=1}finally{await client.end().catch(()=>{})}
