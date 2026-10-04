import { Client } from 'pg'
import { databaseConfig } from './database-client.mjs'
import { readFile,readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
try { process.loadEnvFile('.env.local') } catch {}
const connectionString=process.env.SUPABASE_DB_URL
if(!connectionString)throw new Error('SUPABASE_DB_URL is required')
const client=new Client(databaseConfig())
const apply=process.argv.includes('--apply')
try{
 await client.connect()
 const identity=(await client.query("select current_database() db,current_user role,version() version")).rows[0]
 console.log('Postgres connected; role: '+identity.role)
 const inventory=(await client.query("select table_schema,table_name from information_schema.tables where table_schema in ('private','supabase_migrations') order by table_schema,table_name")).rows
 console.log('Existing database objects: '+inventory.map(t=>t.table_schema+'.'+t.table_name).join(', '))
 if(process.argv.includes('--inspect')){
  const defs=(await client.query("select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('save_profile','meetup_command','my_live_state','friend_command','save_member_settings','report_current_meetup')")).rows
  console.log('Existing app RPCs: '+defs.map(f=>f.proname).join(', '))
 }else{
 const files=(await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()
 const hasHistory=(await client.query("select to_regclass('private.app_schema_migrations') present")).rows[0].present
 const known=hasHistory?(await client.query('select name,checksum from private.app_schema_migrations')).rows:[]
 const baseline=new Map([
 ['202609260001_foundation.sql',"select to_regclass('private.member_access') is not null and to_regprocedure('public.finalize_profile_photo(uuid,text)') is not null ok"],
 ['202609260002_meetup_foundation.sql',"select to_regclass('public.meetup_participants') is not null and to_regprocedure('public.my_meetup_access()') is not null ok"],
 ['202609260003_operational_guards.sql',"select to_regprocedure('public.begin_notification_delivery(uuid,uuid)') is not null and to_regclass('private.upload_limits') is not null ok"],
 ['202609270004_real_matching.sql',"select to_regprocedure('public.my_live_state()') is not null and to_regclass('private.meetup_responses') is not null ok"]
 ])

 const tasks=[]
 for(const name of files){
  const sql=await readFile(resolve('supabase/migrations',name),'utf8');const checksum=createHash('sha256').update(sql.replace(/\r\n/g,'\n')).digest('hex')
  const renamedCandidates=known.filter(m=>m.checksum===checksum&&!files.includes(m.name))
  if(renamedCandidates.length>1)throw new Error('Ambiguous migration rename: '+name)
  const previous=renamedCandidates[0]
  const previousName=previous?.name
  if(previous){if(previous.checksum!==checksum)throw new Error('Renamed migration checksum differs: '+name);tasks.push({name,sql,checksum,existing:true,renameFrom:previousName});console.log('Record filename correction: '+previousName+' -> '+name);continue}
  const old=known.find(m=>m.name===name)
  if(old){if(old.checksum!==checksum)throw new Error('Applied migration changed: '+name);console.log('Recorded: '+name);continue}
  const existing=baseline.has(name)&&(await client.query(baseline.get(name))).rows[0].ok
  tasks.push({name,sql,checksum,existing});console.log((existing?'Existing baseline: ':'Pending: ')+name)
 }
 if(apply){
  await client.query("select pg_advisory_lock(hashtextextended('upcatch-schema-migrations',0))")
  await client.query("create table if not exists private.app_schema_migrations(name text primary key,checksum text not null,applied_at timestamptz not null default now()); alter table private.app_schema_migrations enable row level security; revoke all on private.app_schema_migrations from public,anon,authenticated")
  for(const task of tasks){
   await client.query('begin')
   try{
    if(!task.existing){
     const body=task.sql.replace(/^\s*(?:--[^\n]*\n)*\s*begin;\s*/i,'').replace(/commit;\s*$/i,'')
     await client.query(body)
    }
    if(task.renameFrom){const renamed=await client.query('update private.app_schema_migrations set name=$1 where name=$2 and checksum=$3',[task.name,task.renameFrom,task.checksum]);if(renamed.rowCount!==1)throw new Error('Migration rename conflict')}
    else await client.query('insert into private.app_schema_migrations(name,checksum) values($1,$2)',[task.name,task.checksum]);await client.query('commit')
    console.log((task.existing?'Recorded existing: ':'Applied: ')+task.name)
   }catch(error){await client.query('rollback');console.error('Migration failed: '+task.name+'; SQLSTATE '+(error.code??'unknown'));throw new Error('Migration stopped; no later migrations applied')}
  }
  console.log('Migration application finished')
 }else console.log('Dry run only; use --apply after tests pass')
 }
}catch(error){console.error(error.code?'Database connection/query failed; SQLSTATE '+error.code:error.message);process.exitCode=1}
finally{await client.end().catch(()=>{})}
