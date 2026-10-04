import { randomUUID } from 'node:crypto'

export async function runMatchingChecks(db,{city,asUser,check,reject}) {
  await db.exec('delete from private.match_queue')
  const first=randomUUID(),second=randomUUID(),third=randomUUID()
  for(const [id,name] of [[first,'First'],[second,'Second'],[third,'Third']]){
    await db.query('insert into auth.users values($1,$2,now())',[id,id+'@example.com'])
    await db.query("update public.profiles set display_name=$1,home_city_id=$2,adult_declared_at=now(),photo_path=id::text||'/test.jpg',onboarding_completed_at=now() where id=$3",[name,city,id])
    await db.query("update private.member_settings set age=30,interests=array['Coffee'],audience='both' where user_id=$1",[id])
  }
  const online=(id,intent='coffee',duration=30)=>asUser(id,()=>db.query('select public.go_online($1,$2)',[intent,duration]))
  const state=id=>asUser(id,async()=> (await db.query('select public.my_live_state() s')).rows[0].s)
  const ageQueue=()=>db.query("update private.match_queue set created_at=now()-interval '2 minutes' where user_id=$1",[first])
  async function scenario(fn){
    await db.exec('begin')
    try {await fn()} finally {await db.exec('rollback')}
  }
  const isPair=async(a=first,b=second)=>(await db.query("select count(*)::int n from public.meetup_participants p join public.meetups m on m.id=p.meetup_id where p.user_id in ($1,$2) and p.status='reserved' and m.status='draft'",[a,b])).rows[0].n===2
  for(const friends of [false,true])for(const a of ['friends','public','both'])for(const b of ['friends','public','both']){
    await scenario(async()=>{
      if(friends)await db.query('insert into private.friendships(first_id,second_id) values(least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid))',[first,second])
      await asUser(first,()=>db.query('select public.set_matching_audience($1)',[a]))
      await asUser(second,()=>db.query('select public.set_matching_audience($1)',[b]))
      await online(first);await ageQueue();await online(second)
      const allowed=x=>x==='both'||(x==='friends')===friends
      check(await isPair()===(allowed(a)&&allowed(b)),`Audience ${a}/${b} with ${friends?'friends':'strangers'} is mutual`)
    })
  }
  const activities=['coffee','lunch','drink','walk','chat','networking','explore']
  for(const a of activities)for(const b of activities)await scenario(async()=>{
    await online(first,a);await ageQueue();await online(second,b)
    check(await isPair(),`Activity ${a}/${b} falls back when no preferred activity is available`)
  })
  for(const owner of [first,second])for(const preference of ['Similar age','Shared interests','Verified ID only'])await scenario(async()=>{
    await db.query("insert into private.availability_details(user_id,note,preferences,radius_km) values($1,'',$2,3)",[owner,[preference]])
    await db.query("update private.member_settings set age=50,interests=array['Music'] where user_id=$1",[second])
    await asUser(first,()=>db.exec("select public.meetup_command('live',null,'coffee',30)"));await ageQueue()
    await asUser(second,()=>db.exec("select public.meetup_command('live',null,'coffee',30)"))
    check(!await isPair(),preference+' enforced when selected by '+(owner===first?'first':'second')+' member')
  })
  for(const owner of [first,second])await scenario(async()=>{
    await asUser(owner,()=>db.exec("select public.save_member_settings('{\"verifiedOnly\":true}')"))
    await online(first);await ageQueue();await online(second)
    check(!await isPair(),'Verified-only profile preference is mutual: '+owner)
  })
  await scenario(async()=>{
    await db.query('update public.profiles set home_city_id=(select id from public.cities where slug=$1) where id=$2',['leeds',second])
    await online(first);await online(second)
    check(!await isPair(),'Same activity cannot cross city boundaries')
  })
  for(const owner of [first,second])await scenario(async()=>{
    await db.query('insert into private.member_blocks(blocker_id,blocked_id) values($1,$2)',[owner,owner===first?second:first])
    await online(first);await online(second)
    check(!await isPair(),'Block in either direction excludes pairing')
  })
  for(const owner of [first,second])await scenario(async()=>{
    await db.query("insert into private.availability_details(user_id,note,preferences,radius_km) values($1,'','{}',0.5)",[owner])
    await db.query('update private.member_settings set approx_lat=53.49 where user_id=$1',[second])
    await asUser(first,()=>db.exec("select public.meetup_command('live',null,'coffee',30)"));await ageQueue()
    await asUser(second,()=>db.exec("select public.meetup_command('live',null,'coffee',30)"))
    check(!await isPair(),'The smaller radius is respected for either member')
  })
  for(const [longitude,expected,label] of [[-2.175,true,'Within three miles'],[-2.16,false,'Beyond three miles']])await scenario(async()=>{
    await db.query('update private.member_settings set approx_lon=$1 where user_id=$2',[longitude,second])
    await online(first);await ageQueue();await online(second)
    check((await isPair())===expected,label+' is respected by matching')
  })
  await scenario(async()=>{
    await db.query('update private.member_settings set approx_lat=null,approx_lon=null where user_id=$1',[second])
    await online(first);await online(second)
    check(!await isPair(),'Missing location cannot bypass radius filtering')
  })
  for(const restriction of ["account_status='suspended'","id_status='revoked'","completed_meetups=3"])await scenario(async()=>{
    await online(first);await ageQueue()
    await db.query('update private.member_access set '+restriction+' where user_id=$1',[first])
    await online(second)
    check(!await isPair(),'Ineligible queued member excluded: '+restriction)
  })
  await scenario(async()=>{
    await online(first);await ageQueue();await online(second,'coffee',60)
    const before=await state(first)
    check(before.meetup.venue===null,'Live offer has no automatic venue')
    await asUser(first,async()=>{
      await db.exec('savepoint audience_offer')
      await reject("select public.set_matching_audience('both')",'Legacy audience update cannot change an active offer')
      await db.exec('rollback to savepoint audience_offer; release savepoint audience_offer')
    })
    await asUser(first,()=>db.exec("select public.meetup_command('pass')"))
    const a=await state(first),b=await state(second)
    check(a.queue.intent==='coffee'&&a.queue.duration_min===30&&b.queue.duration_min===60,'Pass restores each original duration and activity')
    const deadline=a.queue.expires_at
    await state(first)
    check((await state(first)).queue.expires_at===deadline,'Polling never extends availability')
    check(!await isPair(),'Pass cooldown prevents repeat suggestion')
    await online(third)
    check(await isPair(first,third),'Requeued member can immediately match another compatible member')
    await asUser(third,()=>db.exec("select public.meetup_command('offline')"))
    check((await state(third)).queue===null,'Explicit offline stays offline')
  })
  await scenario(async()=>{
    await online(first);await ageQueue();await online(second)
    await asUser(first,()=>db.exec("select public.meetup_command('accept')"))
    await asUser(second,()=>db.exec("select public.meetup_command('accept')"))
    await asUser(first,()=>db.exec("select public.meetup_command('cancel')"))
    check(Boolean((await state(first)).queue)&&Boolean((await state(second)).queue),'Confirmed cancellation resumes both valid availabilities')
  })
  await scenario(async()=>{
    await db.query("insert into private.friendships values(least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid),now())",[first,second])
    await asUser(first,()=>db.exec("select public.set_matching_audience('friends')"))
    await online(first);await ageQueue();await online(second)
    await db.query('delete from private.friendships where first_id=least($1::uuid,$2::uuid) and second_id=greatest($1::uuid,$2::uuid)',[first,second])
    await asUser(first,()=>db.exec("select public.meetup_command('accept')"))
    check(!await isPair(),'Removing friendship before acceptance releases incompatible offer')
  })
  await scenario(async()=>{
    await online(first);await ageQueue();await online(second)
    await db.query("update private.meetup_queue_snapshots set expires_at=now()-interval '1 second' where user_id=$1",[first])
    await asUser(second,()=>db.exec("select public.meetup_command('pass')"))
    check((await state(first)).queue===null&&Boolean((await state(second)).queue),'Expired original availability is never revived')
  })
  await scenario(async()=>{
    await db.query("insert into private.match_cooldowns(first_id,second_id,expires_at) values(least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid),now()+interval '1 minute')",[first,second])
    await online(first,'coffee');await ageQueue();await online(second,'lunch')
    const before=await state(first)
    await db.exec("update private.match_cooldowns set expires_at=now()-interval '1 second'")
    await asUser(first,()=>db.exec("select public.update_matching_search('lunch',60,null)"))
    check(await isPair(),'Switching activity while online immediately finds a compatible match')
    const saved=(await db.query('select * from private.meetup_queue_snapshots where user_id=$1',[first])).rows[0]
    check(new Date(saved.expires_at).getTime()===new Date(before.queue.expires_at).getTime(),'Activity switches preserve the availability deadline')
    check(saved.intent==='lunch'&&saved.duration_min===60,'New activity and duration are saved for restoration')
  })
  await scenario(async()=>{
    await asUser(first,()=>db.exec("select public.set_matching_audience('friends')"))
    await online(first);await ageQueue();await online(second)
    await asUser(first,()=>db.exec("select public.update_matching_search(null,null,'both')"))
    check(await isPair(),'Switching audience while online immediately retries matching')
    await asUser(second,()=>db.exec("select public.update_matching_search('drink',120,'public')"))
    check(!await isPair(),'Changing the held second offer releases the obsolete proposal')
    check((await state(second)).queue.intent==='drink'&&Boolean((await state(first)).queue),'Both searches continue after a pending offer changes')
  })
  await scenario(async()=>{
    await online(first);await ageQueue();await online(second)
    await asUser(first,()=>db.exec("select public.meetup_command('accept')"))
    await asUser(second,()=>db.exec("select public.meetup_command('accept')"))
    await asUser(first,async()=>{
      await db.exec('savepoint confirmed_search')
      await reject("select public.update_matching_search('lunch',60,null)",'Search updates cannot alter a confirmed meetup')
      await db.exec('rollback to savepoint confirmed_search; release savepoint confirmed_search')
    })
    check((await state(first)).meetup.status==='confirmed','Rejected change keeps the confirmed meetup intact')
  })
  await scenario(async()=>{
    await asUser(first,()=>db.exec("select public.update_matching_search(null,null,'friends')"))
    check((await state(first)).queue===null,'Changing an offline audience does not start a search')
    const metrics=await asUser(first,async()=> (await db.query('select public.my_profile_stats() s')).rows[0].s)
    check(metrics.completed_meetups===0&&metrics.rating===null&&metrics.show_up_percent===null,'New members have no invented ratings or attendance')
  })
  await scenario(async()=>{
    await asUser(first,()=>db.exec("select public.set_matching_audience('friends')"))
    await asUser(third,()=>db.exec("select public.set_matching_audience('friends')"))
    await online(first,'lunch');await ageQueue();await online(third,'coffee')
    await db.query('insert into private.friendships(first_id,second_id) values(least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid)),(least($2::uuid,$3::uuid),greatest($2::uuid,$3::uuid))',[first,second,third])
    await online(second,'coffee')
    check(await isPair(second,third),'Preferred activity is offered before an older fallback activity')
  })
  await scenario(async()=>{
    await online(first);await ageQueue();await online(second)
    for(let n=1;n<=3;n++){
      await asUser(first,()=>db.exec("select public.meetup_command('pass')"))
      check(Boolean((await state(first)).queue)&&Boolean((await state(second)).queue),'Passing returns both people to the active pool')
      await db.exec("update private.match_cooldowns set expires_at=now()-interval '1 second'")
      await asUser(first,()=>db.exec("select public.meetup_command('retry')"))
      check((await isPair())===(n<3),'A pair is offered at most three times per search')
    }
  })
  await scenario(async()=>{
    await online(first);await ageQueue();await online(second)
    await asUser(first,()=>db.exec("select public.meetup_command('accept')"))
    await asUser(second,()=>db.exec("select public.meetup_command('accept')"))
    await asUser(first,()=>db.exec("select public.meetup_command('arrive')"))
    await asUser(second,()=>db.exec("select public.meetup_command('arrive')"))
    await db.exec("update public.meetups set starts_at=now()-interval '31 minutes',ends_at=now()-interval '1 minute' where status='confirmed'")
    const ended=await state(first)
    check(ended.feedback_pending?.status==='completed','Scheduled end requires meetup feedback')
    check(!(await state(first)).queue&&!(await state(second)).queue,'Feedback gate holds both members out of matching')
    await asUser(first,()=>db.query('select public.complete_meetup_feedback($1,5)',[ended.feedback_pending.id]))
    await asUser(second,()=>db.query('select public.complete_meetup_feedback($1,4)',[ended.feedback_pending.id]))
    check(Boolean((await state(first)).queue)&&Boolean((await state(second)).queue),'Feedback returns eligible members to the pool')
    check((await state(first)).history.some(h=>h.status==='completed'),'Completed meetup remains in history after requeue')
  })
  await scenario(async()=>{
    await online(first);await ageQueue();await online(second)
    await asUser(first,()=>db.exec("select public.meetup_command('accept')"))
    await asUser(second,()=>db.exec("select public.meetup_command('accept')"))
    await db.exec("update public.meetups set starts_at=now()-interval '31 minutes',ends_at=now()-interval '1 minute' where status='confirmed'")
    const ended=await state(first)
    check(ended.feedback_pending?.status==='cancelled'&&!ended.meetup,'Meetup without arrivals closes automatically at scheduled end')
    check(!(await state(first)).queue,'Missed meetup blocks matching until feedback')
    await asUser(first,()=>db.query('select public.complete_meetup_feedback($1,null,false)',[ended.feedback_pending.id]))
    check(Boolean((await state(first)).queue),'Missed meetup feedback returns eligible member to pool')
  })
  await asUser(first,async()=>{
    await reject('select * from private.meetup_queue_snapshots','Resume snapshots remain private')
    await reject('select * from private.match_cooldowns','Pair cooldowns remain private')
    await reject('select * from private.match_offer_counts','Offer counts remain private')
    await reject("select private.pair_preferences_allow('"+first+"','"+second+"','"+city+"')",'Compatibility helper is not exposed to members')
  })
}
