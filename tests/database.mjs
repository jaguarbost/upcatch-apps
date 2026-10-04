import { PGlite } from '@electric-sql/pglite'
import { readFile, readdir } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { runMatchingChecks } from './matching-checks.mjs'

const db = new PGlite()
let checks=0
const check=(condition,message)=>{assert.ok(condition,message); checks++; console.log('PASS '+message)}
async function reject(sql,message) {
  await assert.rejects(()=>db.exec(sql));checks++;console.log('PASS '+message)
}
async function asUser(id,fn) {
  await db.exec("set role authenticated; select set_config('request.jwt.claim.sub','"+id+"',false)")
  try {return await fn()} finally {await db.exec('reset role')}
}
try {
  // Minimal contracts of Supabase-owned schemas, not substitutes for hosted Auth/Storage integration tests.
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create table auth.identities(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id) on delete cascade,provider text not null);
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
    $$;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
    $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,created_at timestamptz default now());
    alter table storage.objects enable row level security;
    grant usage on schema public,storage to authenticated,service_role;
    grant select on storage.objects to authenticated;
  `)
  for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())
    await db.exec(await readFile('supabase/migrations/'+file,'utf8'))
  // Explicit adult/location fixtures for lifecycle tests only.
  await db.exec(`
    create function auth.test_birth_fixture() returns trigger language plpgsql as $$
    begin
      insert into private.birth_details values(new.id,1,1990);
      insert into private.member_settings(user_id,approx_lat,approx_lon) values(new.id,53.48,-2.24);
      return new;
    end $$;
    create trigger test_birth_fixture after insert on auth.users for each row execute function auth.test_birth_fixture();
  `)
  const seed=await readFile('supabase/seed.sql','utf8')
  await db.exec(seed);await db.exec(seed)
  check((await db.query('select count(*)::int n from public.venues')).rows[0].n===20,'Manchester seed contains exactly 20 venues after two runs')
  const city=(await db.query("select id from public.cities where slug='manchester'")).rows[0].id
  check((await db.query("select count(*)::int n from public.venues where reviewed_at is not null or latitude is not null")).rows[0].n===0,'Seed does not invent review status or coordinates')
  await reject("insert into public.cities(country_code,slug,name,timezone,latitude,longitude) values('GB','invalid','Invalid','Made/Up',0,0)",'Invalid timezones rejected')
  const second=randomUUID()
  await db.exec(`insert into public.cities(id,country_code,slug,name,timezone,status,latitude,longitude)
    values('${second}','GB','leeds','Leeds','Europe/London','active',53.8,-1.55)`)
  const neighbour=(await db.query("select id from public.neighbourhoods limit 1")).rows[0].id
  await reject(`insert into public.venues(city_id,neighbourhood_id,slug,name,address) values('${second}','${neighbour}','wrong','Wrong','Wrong')`,'Neighbourhood cannot belong to another city')
  const a=randomUUID(),b=randomUUID(),unconfirmed=randomUUID()
  await db.exec(`insert into auth.users values('${a}','a@example.com',now()),('${b}','b@example.com',now()),('${unconfirmed}','c@example.com',null)`)
  await db.exec('set role anon')
  await reject('select * from public.profiles','Anonymous reads denied')
  await db.exec('reset role')
  await asUser(unconfirmed,async()=>{
    await reject("select public.save_profile('No',true,null)",'Unconfirmed email cannot save profile')
    check((await db.query('select * from public.profiles')).rows.length===0,'Unconfirmed email cannot read profile data')
  })
  await asUser(a,async()=>{
    check((await db.query('select * from public.profiles')).rows.length===1,'Member can only read own profile')
    await reject(`update public.profiles set display_name='Other' where id='${b}'`,'Direct profile mutation denied')
    await reject("update private.member_access set id_status='approved'",'Client cannot self-approve ID')
    await reject(`select public.finalize_profile_photo('${a}','${a}/fake.jpg')`,'Privileged photo finalization denied to client')
    await reject(`select public.claim_notification_jobs(10,null)`,'Clients cannot claim delivery jobs')
    await db.exec(`select public.save_profile('Alex',true,'${city}')`)
    check((await db.query("select count(*)::int n from public.venues")).rows[0].n===20,'Confirmed member can browse listed venues')
  })
  await asUser(a,async()=>{
    await reject("select public.save_profile_birth('Minor',1,extract(year from now())::integer-17,null)",'Under-18 birth details rejected by database');
    await reject("select public.save_profile_birth('Birthday month',extract(month from now())::integer,extract(year from now())::integer-18,null)",'Current 18th birthday month rejected');
    await reject("select public.save_profile_birth('Invalid',13,1990,null)",'Invalid birth month rejected');
    await db.exec("select public.request_privacy_right('access'); select public.request_privacy_right('access')");
    check((await db.query('select * from public.my_privacy_requests()')).rows.length===1,'Duplicate open privacy requests prevented');
    await reject('select * from private.privacy_requests','Private privacy requests denied to browser');
  })
  await asUser(b,async()=>{
    check((await db.query('select * from public.my_privacy_requests()')).rows.length===0,'Cross-account privacy requests denied');
  })
  await db.query('delete from private.birth_details where user_id=$1',[b])
  await asUser(b,async()=>{
    await reject("select public.save_profile('Bypass',true,null)",'Adult checkbox cannot bypass birth requirement');
    await db.exec("select public.save_profile_birth('Adult',1,1990,null)");
    check((await db.query('select public.my_birth_eligibility() eligible')).rows[0].eligible,'Adult birth details accepted');
  })
  const photo=a+'/photo.jpg'
  await reject(`select public.finalize_profile_photo('${a}','${photo}')`,'Missing Storage object cannot finalize onboarding')
  await db.exec(`insert into storage.objects(bucket_id,name) values('profile-photos','${photo}');
    select public.finalize_profile_photo('${a}','${photo}');
    select public.finalize_profile_photo('${a}','${photo}');`)
  check((await db.query("select count(*)::int n from private.notification_jobs")).rows[0].n===1,'Repeated photo finalization queues one welcome email')
  await asUser(b,async()=>{
    check((await db.query('select * from storage.objects')).rows.length===0,'Other member cannot read photo objects')
  })
  await asUser(a,async()=>{
    check((await db.query('select * from storage.objects')).rows.length===1,'Owner can read current photo only')
  })
  const quota=[]
  for(let i=0;i<4;i++)quota.push((await db.query(`select public.reserve_photo_upload('${a}') allowed`)).rows[0].allowed)
  check(quota.slice(0,3).every(Boolean)&&quota[3]===false,'Photo upload attempts are limited per member')
  const claimed=(await db.query('select * from public.claim_notification_jobs(10,null)')).rows
  check(claimed.length===1,'Pending notification can be claimed')
  check((await db.query('select * from public.claim_notification_jobs(10,null)')).rows.length===0,'Leased notification cannot be double-claimed')
  await db.exec(`select public.finish_notification_job('${claimed[0].id}','${randomUUID()}','sent',null)`)
  check((await db.query("select state from private.notification_jobs")).rows[0].state==='processing','Stale worker cannot finish another lease')
  await db.exec(`select public.finish_notification_job('${claimed[0].id}','${claimed[0].lease_token}','sent',null)`)
  await db.exec(`insert into private.notification_jobs(user_id,event_key,kind) values('${a}','replay-test','welcome_email')`)
  const retry=(await db.query('select * from public.claim_notification_jobs(10,null)')).rows[0]
  check((await db.query(`select public.begin_notification_delivery('${retry.id}','${retry.lease_token}') allowed`)).rows[0].allowed,'First provider attempt records its replay window')
  await db.exec(`update private.notification_jobs set provider_attempted_at=now()-interval '25 hours' where id='${retry.id}'`)
  check(!(await db.query(`select public.begin_notification_delivery('${retry.id}','${retry.lease_token}') allowed`)).rows[0].allowed,'Ambiguous email is not replayed after provider deduplication expires')
  const venue=(await db.query('select id from public.venues limit 1')).rows[0].id
  await reject(`insert into public.meetups(city_id,venue_id,host_id,starts_at,ends_at)
    values('${second}','${venue}','${a}',now(),now()+interval '1 hour')`,'Meetup venue cannot cross city boundaries')
  const meetings=[]
  for(let i=0;i<4;i++){
    const id=randomUUID();meetings.push(id)
    await db.exec(`insert into public.meetups(id,city_id,venue_id,host_id,starts_at,ends_at,status)
      values('${id}','${city}','${venue}','${a}',now()-interval '2 hours',now()-interval '1 hour','confirmed')`)
  }
  for(let i=0;i<3;i++){
    await db.exec(`insert into public.meetup_participants(meetup_id,user_id,status) values('${meetings[i]}','${a}','reserved')`)
    if(i===0)await reject(`insert into public.meetup_participants(meetup_id,user_id,status) values('${meetings[1]}','${a}','reserved')`,'Multiple simultaneous reservations denied')
    await reject(`update public.meetup_participants set status='completed',completed_at=now() where meetup_id='${meetings[i]}'`,'Completion requires trusted meetup lifecycle')
    await db.exec(`update public.meetups set status='completed' where id='${meetings[i]}';
      update public.meetup_participants set status='completed',completed_at=now() where meetup_id='${meetings[i]}';
      update public.meetup_participants set completed_at=now() where meetup_id='${meetings[i]}'`)
  }
  await reject(`insert into public.meetup_participants(meetup_id,user_id,status) values('${meetings[3]}','${a}','reserved')`,'Fourth meetup requires ID approval')
  await asUser(a,async()=>{
    await db.exec(`select public.save_profile('Alex',true,'${second}')`)
    const access=(await db.query('select * from public.my_meetup_access()')).rows[0]
    check(access.completed_meetups===3&&access.id_required,'Changing home city and replaying completion do not reset allowance')
  })
  await db.exec(`update private.member_access set id_status='approved' where user_id='${a}';
    insert into public.meetup_participants(meetup_id,user_id,status) values('${meetings[3]}','${a}','reserved');
    update public.meetup_participants set status='cancelled' where meetup_id='${meetings[3]}'`)
  const ledger=(await db.query(`select * from private.member_access where user_id='${a}'`)).rows[0]
  check(ledger.completed_meetups===3&&ledger.reserved_meetups===0,'Approval unlocks participation and cancellation releases reservation without counting')
  await db.exec('set role service_role')
  await reject('delete from public.meetup_participants','Service API cannot delete participation and bypass ledger')
  await db.exec('reset role')

  {
  const c=randomUUID(),d=randomUUID(),venue=(await db.query("select id from public.venues where city_id='"+city+"' limit 1")).rows[0].id
  await db.exec(`insert into auth.users values('${c}','cycle1@example.com',now()),('${d}','cycle2@example.com',now());
    update public.profiles set photo_path=id::text||'/cycle.jpg',display_name='Cycle',home_city_id='${city}',adult_declared_at=now(),onboarding_completed_at=now() where id in ('${c}','${d}')`)
  await asUser(c,async()=>{
    await reject('select * from private.match_queue','Matching queue remains private')
    await db.exec(`select public.meetup_command('live','${venue}','coffee',15)`)
    check(Boolean((await db.query('select public.my_live_state() s')).rows[0].s.queue),'First live member waits in queue')
  })
  await asUser(d,async()=>{await db.exec(`select public.meetup_command('live','${venue}','coffee',30)`)})
  await asUser(d,async()=>{
    const pending=(await db.query('select public.my_live_state() s')).rows[0].s
    check(pending.awaiting_offer&&!pending.meetup,'Second person cannot see the proposal before first acceptance')
    await reject("select public.meetup_command('accept')",'Second person cannot accept before first person')
  })
  const matched=(await db.query(`select meetup_id from private.meetup_responses where user_id='${c}'`)).rows[0].meetup_id
  await asUser(c,async()=>{
    const state=(await db.query('select public.my_live_state() s')).rows[0].s
    check(state.meetup.status==='draft'&&!state.queue,'Compatible users produce a pending mutual proposal')
    check(Date.parse(state.meetup.proposal_expires_at)-Date.parse(state.meetup.starts_at)===30000,'First person receives a 30-second offer')
    await reject("select public.meetup_command('arrive')",'Arrival before mutual acceptance rejected')
    await reject(`select public.meetup_command('live','${venue}','coffee',15)`,'Reserved member cannot seek another match')
    await db.exec("select public.meetup_command('accept')")
  })
  await asUser(c,async()=>{await reject("select * from public.notification_recipients('"+c+"')",'Browser cannot enumerate notification recipients')});
  await db.exec('set role service_role');
  const recipients=(await db.query('select * from public.notification_recipients($1)',[c])).rows.map(row=>row.user_id).sort();
  check(JSON.stringify(recipients)===JSON.stringify([c,d].sort()),'Server dispatch includes both meetup participants');
  const unrelatedRecipients=(await db.query('select * from public.notification_recipients($1)',[unconfirmed])).rows;
  check(unrelatedRecipients.length===1&&unrelatedRecipients[0].user_id===unconfirmed,'Unrelated account cannot dispatch another meetup');
  await db.exec('reset role');
  const secondWindow=(await db.query('select extract(epoch from (d.proposal_expires_at-r.accepted_at)) seconds from private.meetup_details d join private.meetup_responses r on r.meetup_id=d.meetup_id where d.meetup_id=$1 and r.user_id=$2',[matched,c])).rows[0].seconds;
  check(Number(secondWindow)===30,'Second person receives a fresh 30-second window after first acceptance');
  await db.query("update private.meetup_details set proposal_expires_at=now()+interval '15 seconds' where meetup_id=$1",[matched]);
  const originalDeadline=(await db.query('select proposal_expires_at from private.meetup_details where meetup_id=$1',[matched])).rows[0].proposal_expires_at;
  await asUser(c,async()=>{await db.exec("select public.meetup_command('accept')")});
  check((await db.query('select proposal_expires_at from private.meetup_details where meetup_id=$1',[matched])).rows[0].proposal_expires_at.getTime()===originalDeadline.getTime(),'Retrying first acceptance cannot extend the second offer');
  await asUser(d,async()=>{await db.exec("select public.meetup_command('accept'); select public.meetup_command('arrive')")})
  await asUser(c,async()=>{
    check((await db.query('select public.my_live_state() s')).rows[0].s.meetup.status==='confirmed','Both acceptances confirm the meetup')
    await db.exec("select public.meetup_command('arrive')")
    await reject("select public.meetup_command('finish')",'Completion before scheduled end rejected')
  })
  await db.exec(`update public.meetups set starts_at=now()-interval '20 minutes',ends_at=now()-interval '1 minute' where id='${matched}'`)
  await asUser(c,async()=>{const state=(await db.query('select public.my_live_state() s')).rows[0].s;check(state.feedback_pending?.id===matched,'Scheduled end opens mandatory feedback');await reject("select public.meetup_command('finish')",'Completion replay rejected')})
  check((await db.query('select status from public.meetups where id=$1',[matched])).rows[0].status==='completed','Scheduled end closes the meetup for both arrived members')
  check((await db.query('select count(*)::int n from private.match_queue where user_id in ($1,$2)',[c,d])).rows[0].n===0,'Members wait for feedback before rejoining matching')
  await asUser(d,async()=>{await reject("select public.meetup_command('finish')",'Peer cannot double-count completion');await db.query('select public.complete_meetup_feedback($1,4)',[matched])})
  check((await db.query('select count(*)::int n from private.member_access where user_id in ($1,$2) and completed_meetups=1 and reserved_meetups=0',[c,d])).rows[0].n===2,'Automatic closure updates both global ledgers exactly once')
  await asUser(c,async()=>{
    await db.query('select public.complete_meetup_feedback($1,5)',[matched])
    check((await db.query('select public.my_live_state() s')).rows[0].s.history[0].rating===5,'Rating persists in real history')
    const metrics=(await db.query('select public.my_live_state() s')).rows[0].s.profile_stats
    check(metrics.completed_meetups===1&&metrics.rating===4&&metrics.rating_count===1&&metrics.show_up_percent===100,'Profile stats refresh completion, received rating and attendance')
    await db.query('select public.rate_meetup($1,3)',[matched])

  })
  check((await db.query('select count(*)::int n from private.match_queue where user_id in ($1,$2)',[c,d])).rows[0].n===2,'Completion returns both members to matching')
  await asUser(c,async()=>{await db.exec(`select public.meetup_command('live','${venue}','coffee',15)`)})
  await asUser(d,async()=>{await db.exec(`select public.meetup_command('live','${venue}','coffee',15)`)})
  await db.exec("update private.match_cooldowns set expires_at=now()-interval '1 second'")
  await asUser(c,async()=>{await db.exec("select public.meetup_command('retry')")})
  await asUser(d,async()=>{await db.exec("select public.meetup_command('cancel')")})
  check((await db.query(`select sum(reserved_meetups)::int n from private.member_access where user_id in ('${c}','${d}')`)).rows[0].n===0,'Declining a proposal releases both reservations')
  check((await db.query('select count(*)::int n from private.match_queue where user_id in ($1,$2)',[c,d])).rows[0].n===2,'Passing restores both original queues');
  await asUser(c,async()=>{check(Boolean((await db.query('select public.my_live_state() s')).rows[0].s.queue),'Cooldown prevents immediate rematch')});
  await asUser(c,async()=>{await db.exec("select public.meetup_command('live',null,'networking',120)")})
  await asUser(d,async()=>{await db.exec("select public.meetup_command('live',null,'chat',30)")})
  await db.exec("update private.match_cooldowns set expires_at=now()-interval '1 second'")
  await asUser(c,async()=>{await db.exec("select public.meetup_command('retry')")})
  await asUser(d,async()=>{check((await db.query('select public.my_live_state() s')).rows[0].s.awaiting_offer,'Different activities use fallback with second offer held back')})
  await asUser(c,async()=>{
    const match=(await db.query('select public.my_live_state() s')).rows[0].s.meetup
    check(match.status==='draft'&&match.venue===null,'Matching works without suggesting a venue')
    await db.exec("select public.meetup_command('accept')")
  })
  await asUser(d,async()=>{
    check(Boolean((await db.query('select public.my_live_state() s')).rows[0].s.meetup),'Second person receives proposal after first accepts')
    await db.exec("select public.meetup_command('cancel')")
  })
  await asUser(c,async()=>{await db.exec("select public.meetup_command('live',null,'coffee',30)")})
  await asUser(d,async()=>{await db.exec(`select public.meetup_command('live','${venue}','coffee',30)`)})
  await db.exec("update private.match_cooldowns set expires_at=now()-interval '1 second'")
  await asUser(c,async()=>{await db.exec("select public.meetup_command('retry')")})
  await asUser(c,async()=>{
    check((await db.query('select public.my_live_state() s')).rows[0].s.meetup.venue===null,'Matching leaves venue choice to members in chat')
  })
  await db.exec(`update private.meetup_details set proposal_expires_at=now()-interval '1 minute' where meetup_id in (select meetup_id from private.meetup_responses where user_id='${c}')`)
  await asUser(c,async()=>{await reject("select public.meetup_command('accept')",'First person cannot accept after offer expiry')});
  await asUser(d,async()=>{await reject("select public.meetup_command('accept')",'Second person cannot accept after offer expiry')});
  await asUser(c,async()=>{check(!(await db.query('select public.my_live_state() s')).rows[0].s.meetup,'Expired proposals disappear from the live state')})
  check((await db.query(`select sum(reserved_meetups)::int n from private.member_access where user_id in ('${c}','${d}')`)).rows[0].n===0,'Proposal expiry releases both reservations')

  await asUser(c,async()=>{await db.exec("select public.meetup_command('live',null,'chat',30)")})
  await asUser(d,async()=>{await db.exec("select public.meetup_command('live',null,'chat',30)")})
  await db.exec("update private.match_cooldowns set expires_at=now()-interval '1 second'")
  await asUser(c,async()=>{await db.exec("select public.meetup_command('retry')")})
  await asUser(c,async()=>{
    await reject('select * from private.meetup_reports','Reports cannot be read by members')
    await db.exec("select public.report_current_meetup('Made me uncomfortable',true)")
  })
  check((await db.query(`select count(*)::int n from private.meetup_reports where reporter_id='${c}' and reported_id='${d}'`)).rows[0].n===1,'Safety report is saved against the actual counterpart')
  check((await db.query(`select sum(reserved_meetups)::int n from private.member_access where user_id in ('${c}','${d}')`)).rows[0].n===0,'Report and leave releases both reservations')
  await asUser(c,async()=>{await db.exec("select public.meetup_command('live',null,'chat',30)")})
  await asUser(d,async()=>{
    await db.exec("select public.meetup_command('live',null,'chat',30)")
    check(Boolean((await db.query('select public.my_live_state() s')).rows[0].s.queue),'Blocked members are excluded from future matching')
  })
  }

  {
   const e=randomUUID(),f=randomUUID();
   await db.exec('delete from private.match_queue');
   await db.query('insert into auth.users values($1,$2,now()),($3,$4,now())',[e,'settings1@example.com',f,'settings2@example.com']);
   await db.query("update public.profiles set photo_path=id::text||'/test.jpg',display_name='Settings',home_city_id=$1,adult_declared_at=now(),onboarding_completed_at=now() where id in ($2,$3)",[city,e,f]);
   await asUser(e,async()=>{
    await db.exec("select public.save_profile('Manchester default',true)");
    await db.query('select public.save_member_settings($1)',[JSON.stringify({age:28,interests:['Coffee','Design'],hideAge:true,latitude:53.48291,longitude:-2.23451,trustedEmail:'contact@example.com',share:true})]);
    check((await db.query('select public.my_live_state() s')).rows[0].s.settings.age===28,'Declared age and preferences persist privately');
    await reject('select * from private.member_settings','Private member settings are not directly readable');
    await reject("select public.save_member_settings('{\"id_status\":\"approved\"}')",'Unknown settings cannot alter member approval');
    await reject("select public.send_meetup_message('Before match')",'Chat outside confirmed meetup is denied');
    await db.exec("select public.set_matching_audience('friends');select public.meetup_command('live',null,'coffee',30)");
   });
   check((await db.query('select approx_lat from private.member_settings where user_id=$1',[e])).rows[0].approx_lat===53.48,'Stored location is rounded rather than exact GPS');
   await asUser(f,async()=>{await db.exec("select public.meetup_command('live',null,'chat',30)");check(Boolean((await db.query('select public.my_live_state() s')).rows[0].s.queue),'Friends-only member does not match a stranger')});
   await asUser(e,async()=>{await db.exec("select public.set_matching_audience('both');select public.publish_availability('chat',30,60,1,'New to Manchester','{}')")});
   // F was queued first when E rejoined, so F must accept before E sees the offer.
   const mid=(await db.query('select meetup_id from private.meetup_responses where user_id=$1',[e])).rows[0].meetup_id;
   check((await db.query("select count(*)::int n from private.notification_jobs where event_key like 'offer:'||$1||'%'",[mid])).rows[0].n===1,'Only first person gets the initial notification job');
   check((await db.query("select count(*)::int n from private.notification_jobs where kind='paired_email' and payload->>'meetup_id'=$1",[mid])).rows[0].n===0,'Draft match does not send pairing emails');
   await asUser(f,async()=>{await db.exec("select public.meetup_command('accept')")});
   check((await db.query("select count(*)::int n from private.notification_jobs where kind='paired_email' and payload->>'meetup_id'=$1",[mid])).rows[0].n===0,'First acceptance alone does not send pairing emails');
   await asUser(e,async()=>{await db.exec("select public.meetup_command('accept')")});
   await asUser(e,async()=>{await reject("select public.meetup_command('accept')",'Repeated confirmed acceptance is rejected')});
   check((await db.query("select count(*)::int n from private.notification_jobs where kind='paired_email' and payload->>'meetup_id'=$1",[mid])).rows[0].n===2,'Mutual acceptance queues one pairing email per member without duplicates');

   await asUser(f,async()=>{
    check((await db.query('select public.my_live_state() s')).rows[0].s.meetup.other_age===null,'Hidden age is not disclosed to matched peer');
    await db.exec("select public.send_meetup_message('On my way')");
    check((await db.query('select public.my_live_state() s')).rows[0].s.messages[0].from==='me','Sent messages appear in sender snapshot');
   });
   await asUser(e,async()=>{
    check((await db.query('select public.my_live_state() s')).rows[0].s.messages[0].from==='them','Peer reads shared meetup message');
    await reject("select public.friend_from_meetup('"+mid+"')",'Friendship cannot be requested before both arrive');
    for(let i=0;i<10;i++)await db.query('select public.send_meetup_message($1)',['Message '+i]);
    await reject("select public.send_meetup_message('Too many')",'Chat rate limit is enforced');
    await db.exec("select public.meetup_command('arrive')");
   });
   await asUser(f,async()=>{await db.exec("select public.meetup_command('arrive')")});
   await asUser(e,async()=>{check(!(await db.query('select public.friend_from_meetup($1) ok',[mid])).rows[0].ok,'Friendship requires peer confirmation')});
   await asUser(f,async()=>{check((await db.query('select public.friend_from_meetup($1) ok',[mid])).rows[0].ok,'Mutual friend request creates relationship')});
   await asUser(e,async()=>{check((await db.query('select public.my_live_state() s')).rows[0].s.friends.length===1,'Confirmed friend appears in real list');await db.query('select public.remove_friend($1)',[f]);check((await db.query('select public.my_live_state() s')).rows[0].s.friends.length===0,'Removing friend persists')});
   check((await db.query("select count(*)::int n from private.notification_jobs where kind='trusted_email' and user_id=$1 and payload->>'to'='contact@example.com'",[e])).rows[0].n===1,'Confirmation queues one opt-in trusted-contact email');
   await asUser(b,async()=>{check((await db.query('select public.my_live_state() s')).rows[0].s.messages.length===0,'Unrelated member cannot read messages');await reject("select public.friend_from_meetup('"+mid+"')",'Unrelated member cannot befriend participant')});
  }

  {
   await db.exec('delete from private.match_queue');
   const g=randomUUID(),h=randomUUID();
   await db.query('insert into auth.users values($1,$2,now()),($3,$4,now())',[g,'radius1@example.com',h,'radius2@example.com']);
   await db.query("update public.profiles set photo_path=id::text||'/radius.jpg',display_name='Radius',home_city_id=$1,adult_declared_at=now(),onboarding_completed_at=now() where id in ($2,$3)",[city,g,h]);
   await asUser(g,async()=>{await db.query('select public.save_member_settings($1)',[JSON.stringify({latitude:53.48,longitude:-2.24})]);await db.exec("select public.publish_availability('coffee',30,60,0.5,'Nearby only','{}')")});
   await asUser(h,async()=>{await db.query('select public.save_member_settings($1)',[JSON.stringify({latitude:54.48,longitude:-2.24})]);await db.exec("select public.meetup_command('live',null,'coffee',30)");check(Boolean((await db.query('select public.my_live_state() s')).rows[0].s.queue),'Saved radius prevents distant members from pairing')});
   await asUser(h,async()=>{await db.query('select public.save_member_settings($1)',[JSON.stringify({latitude:53.48,longitude:-2.24})]);await db.exec("select public.meetup_command('live',null,'coffee',30)")});
   await asUser(g,async()=>{check(Boolean((await db.query('select public.my_live_state() s')).rows[0].s.meetup),'Nearby members pair within selected radius');await db.exec("select public.meetup_command('accept')")});
   await asUser(h,async()=>{check((await db.query('select public.my_live_state() s')).rows[0].s.meetup.note==='Nearby only','Saved availability note appears in the peer offer');await db.exec("select public.meetup_command('cancel')")});
  }

  {
   await db.exec('delete from private.match_queue');
   const tracked=randomUUID();
   await db.query('insert into auth.users values($1,$2,now())',[tracked,'presence@example.com']);
   await db.query("update public.profiles set photo_path=id::text||'/presence.jpg',display_name='Presence',home_city_id=$1,adult_declared_at=now(),onboarding_completed_at=now() where id=$2",[city,tracked]);
   await asUser(tracked,async()=>{
    await db.exec("select public.meetup_command('live',null,'coffee',30);select public.meetup_command('live',null,'lunch',60)");
    let stats=(await db.query('select public.my_presence_stats() s')).rows[0].s;
    check(stats.online_count===1&&stats.status==='online','Going live is counted once even after requeueing');
    await db.exec("select public.my_live_state();select public.my_live_state();select public.meetup_command('offline');select public.meetup_command('offline')");
    stats=(await db.query('select public.my_presence_stats() s')).rows[0].s;
    check(stats.online_count===1&&stats.offline_count===1&&stats.manual_offline_count===1,'Repeated offline taps and polling do not inflate counts');
    await reject('select * from private.presence_events','Members cannot read raw presence events');
    await reject("delete from private.presence_events",'Members cannot erase their presence history');
    await db.exec("select public.meetup_command('live',null,'chat',30)");
   });
   await db.query("update private.match_queue set expires_at=now()-interval '1 minute' where user_id=$1",[tracked]);
   await asUser(tracked,async()=>{
    await db.exec('select public.my_live_state()');
    const stats=(await db.query('select public.my_presence_stats() s')).rows[0].s;
    check(stats.online_count===2&&stats.offline_count===2&&stats.recent[0].reason==='expired','Availability expiry is tracked separately from manual offline');
   });
   await asUser(b,async()=>{check((await db.query('select public.my_presence_stats() s')).rows[0].s.online_count===0,'Presence stats only describe the signed-in member')});
  }

  {
   await db.exec('delete from private.match_queue');
   const manual=randomUUID(),auto=randomUUID();
   await db.query('insert into auth.users values($1,$2,now()),($3,$4,now())',[manual,'manual@example.com',auto,'auto@example.com']);
   await db.query("update public.profiles set photo_path=id::text||'/origin.jpg',display_name='Origin',home_city_id=$1,adult_declared_at=now(),onboarding_completed_at=now() where id in ($2,$3)",[city,manual,auto]);
   await asUser(manual,async()=>{await db.exec("select public.publish_availability('coffee',30,60,1,'Created manually','{}')");check((await db.query('select public.my_live_state() s')).rows[0].s.queue.creation_type==='manual','Manually created availability records its origin')});
   await asUser(auto,async()=>{await db.exec("select public.go_online('coffee',30)")});
   await asUser(manual,async()=>{check((await db.query('select public.my_live_state() s')).rows[0].s.meetup.creation_type==='manual','Auto user and manual creator share one manual-origin meetup');await db.exec("select public.meetup_command('cancel');select public.go_online('coffee',30)");check((await db.query('select public.my_live_state() s')).rows[0].s.queue.creation_type==='auto','Going online resets stale manual origin')});
   await db.exec("update private.match_cooldowns set expires_at=now()-interval '1 second'");
   await asUser(auto,async()=>{await db.exec("select public.go_online('coffee',30)")});
   await asUser(manual,async()=>{check((await db.query('select public.my_live_state() s')).rows[0].s.meetup.creation_type==='auto','Two automatic members create an auto-origin meetup');await db.exec("select public.meetup_command('cancel')")});
  }

  {
   await db.exec('delete from private.match_queue');
   const located=randomUUID(),peer=randomUUID();
   await db.query('insert into auth.users values($1,$2,now()),($3,$4,now())',[located,'map1@example.com',peer,'map2@example.com']);
   await db.query("update public.profiles set photo_path=id::text||'/map.jpg',display_name='Map',home_city_id=$1,adult_declared_at=now(),onboarding_completed_at=now() where id in ($2,$3)",[city,located,peer]);
   await asUser(located,async()=>{await db.query('select public.save_member_settings($1)',[JSON.stringify({latitude:53.481234,longitude:-2.241234})]);await db.exec("select public.go_online('coffee',30)");check((await db.query('select public.my_partner_location() s')).rows[0].s===null,'No peer location is exposed while unmatched')});
   await asUser(peer,async()=>{await db.query('select public.save_member_settings($1)',[JSON.stringify({latitude:53.481999,longitude:-2.241999})]);await db.exec("select public.go_online('coffee',30)");check((await db.query('select public.my_partner_location() s')).rows[0].s===null,'Second member cannot read peer area before first acceptance')});
   await asUser(located,async()=>{const area=(await db.query('select public.my_partner_location() s')).rows[0].s;check(area.latitude===53.48&&area.longitude===-2.24&&Boolean(area.updated_at),'First member sees only rounded, timestamped partner area');await db.exec("select public.meetup_command('accept')")});
   await asUser(peer,async()=>{check(Boolean((await db.query('select public.my_partner_location() s')).rows[0].s),'Second member receives partner area after first acceptance');await db.exec("select public.meetup_command('cancel')");check((await db.query('select public.my_partner_location() s')).rows[0].s===null,'Cancelled meetup no longer exposes peer area')});
   await asUser(b,async()=>{check((await db.query('select public.my_partner_location() s')).rows[0].s===null,'Unrelated member cannot read partner area')});
  }
  {
   const linked=randomUUID();
   await db.query('insert into auth.users values($1,$2,now())',[linked,'linked@example.com']);
   await asUser(linked,async()=>{
    const policy=(await db.query('select public.my_signin_policy() p')).rows[0].p;
    check(policy.allowed&&!policy.google_required,'Email-only account retains password access');
   });
   await db.query("insert into auth.identities(user_id,provider) values($1,'google')",[linked]);
   await asUser(linked,async()=>{
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({amr:[{method:'password'}]})]);
    const policy=(await db.query('select public.my_signin_policy() p')).rows[0].p;
    check(!policy.allowed&&policy.google_required,'Linking Google blocks existing password sessions on the same account');
    check((await db.query('select * from public.profiles')).rows.length===0,'Google account password session cannot read profiles');
    await reject("select public.save_profile('Bypass',true,null)",'Google account password session cannot mutate profile');
    await reject("select public.email_uses_google('linked@example.com')",'Members cannot enumerate Google-linked email addresses');
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({amr:[{method:'oauth'}]})]);
    check((await db.query('select public.my_signin_policy() p')).rows[0].p.allowed,'OAuth session restores access to the linked account');
    check((await db.query('select * from public.profiles')).rows.some(row=>row.id===linked),'Google sign-in preserves the original profile UUID');
   });
   await db.exec('set role service_role');
   check((await db.query("select public.email_uses_google(' LINKED@EXAMPLE.COM ') linked")).rows[0].linked,'Service lookup normalizes the linked email');
   await db.exec('reset role');
   await db.query('delete from auth.identities where user_id=$1',[linked]);
   await asUser(linked,async()=>{
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({amr:[{method:'recovery'}]})]);
    const policy=(await db.query('select public.my_signin_policy() p')).rows[0].p;
    check(!policy.allowed&&policy.google_required,'Unlinking Google and using recovery cannot bypass Google sign-in');
   });
   await db.exec("select set_config('request.jwt.claims','{}',false)");
  }

  {
    const operator=randomUUID(), subject=randomUUID();
    await db.query('insert into auth.users values($1,$2,now()),($3,$4,now())',[operator,'operator@example.com',subject,'managed@example.com']);
    await db.query("update public.profiles set display_name='Managed',home_city_id=$1,adult_declared_at=now(),photo_path=id::text||'/test.jpg',onboarding_completed_at=now() where id=$2",[city,subject]);
    await db.exec('set role anon');
    await reject('select public.admin_dashboard()','Anonymous admin dashboard denied');
    await db.exec('reset role');
    await asUser(subject,async()=>{
      await reject('select public.admin_dashboard()','Ordinary member cannot inspect admin data');
      await reject("insert into private.admin_members(user_id) values('"+subject+"')",'Member cannot self-promote to admin');
      await reject("select public.admin_update_entitlement('"+subject+"',10,'active',0,'Self upgrade')",'Member cannot upgrade their own allowance');
    });
    await db.query('insert into private.admin_members(user_id) values($1),($2)',[operator,unconfirmed]);
    await asUser(unconfirmed,async()=>{await reject('select public.admin_dashboard()','Unconfirmed admin cannot inspect data')});
    await asUser(operator,async()=>{
      const overview=(await db.query('select public.admin_dashboard($1,0) d',['managed@example.com'])).rows[0].d;
      check(overview.members.length===1 && overview.members[0].id===subject,'Admin member search returns real data');
      check(overview.stats.members>0 && Array.isArray(overview.meetups) && Array.isArray(overview.online),'Admin overview returns stats, meetups and online members');
      await db.query('select public.admin_update_entitlement($1,0,$2,0,$3)',[subject,'paused','Pause new participation']);
      await reject("select public.admin_update_entitlement('"+subject+"',10,'active',0,'Stale edit')",'Stale admin edit cannot overwrite newer settings');
      await reject("select public.admin_update_entitlement('"+subject+"',-1,'active',1,'Bad allowance')",'Negative allowance denied');
      await reject("select public.admin_update_entitlement('"+subject+"',1,'invalid',1,'Bad subscription')",'Unknown subscription denied');
    });
    await asUser(subject,async()=>{await reject("select public.meetup_command('live',null,'coffee',30)",'Zero allowance is enforced at the queue boundary')});
    const before=(await db.query('select completed_meetups,id_status from private.member_access where user_id=$1',[subject])).rows[0];
    check(before.completed_meetups===0 && before.id_status==='not_submitted','Admin allowance updates do not rewrite completion or ID status');
    check((await db.query('select count(*)::int n from private.admin_audit where user_id=$1',[subject])).rows[0].n===1,'Successful admin changes are audited exactly once');
    await db.query('update private.member_access set completed_meetups=3 where user_id=$1',[subject]);
    await asUser(operator,async()=>{await db.query('select public.admin_update_entitlement($1,null,$2,1,$3)',[subject,'active','Grant unlimited commercial allowance'])});
    await asUser(subject,async()=>{await reject("select public.meetup_command('live',null,'coffee',30)",'Active subscription and unlimited allowance cannot bypass the three-meetup ID gate')});
    await db.query('delete from private.admin_members where user_id=$1',[operator]);
    await asUser(operator,async()=>{await reject('select public.admin_dashboard()','Removing admin access takes effect immediately')});
  }

  await runMatchingChecks(db,{city,asUser,check,reject})
  console.log('\n'+checks+' database checks passed.')
} catch(error) { console.error('Database check failed:',error.message,'code:',error.code??'', 'position:',error.position??''); process.exitCode=1 } finally {await db.close()}
