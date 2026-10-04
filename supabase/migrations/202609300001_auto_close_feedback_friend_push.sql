-- Close meetups at their scheduled end, require feedback before re-entry, and dispatch friend pushes.
begin;
alter table private.meetup_responses add column feedback_ack_at timestamptz, add column feedback_met boolean;
update private.meetup_responses r set feedback_ack_at=now() from public.meetups m where m.id=r.meetup_id and m.status='completed';
alter table private.meetup_details add column closure_reason text check(closure_reason in ('scheduled_end'));
create or replace function private.can_queue(p_user uuid,p_city uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from private.member_access a join public.profiles p on p.id=a.user_id
  join auth.users u on u.id=p.id join public.cities c on c.id=p.home_city_id
  where p.id=p_user and p.home_city_id=p_city and c.status='active'
   and p.onboarding_completed_at is not null and u.email_confirmed_at is not null
   and a.account_status='active' and a.reserved_meetups=0 and private.is_adult(p_user)
   and (a.id_status='approved' or (a.id_status<>'revoked' and a.completed_meetups<3))
   -- Respect an installed entitlement cap without depending on the deferred admin migration.
   and ((to_jsonb(a)->>'meetup_limit') is null or a.completed_meetups<(to_jsonb(a)->>'meetup_limit')::integer)
   and not exists(select 1 from private.meetup_responses r join public.meetups m on m.id=r.meetup_id join private.meetup_details d on d.meetup_id=m.id where r.user_id=p_user and r.feedback_ack_at is null and (m.status='completed' or (m.status='cancelled' and d.closure_reason='scheduled_end')))
 );
$$;
create or replace function private.expire_matches(p_city uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_user uuid;
begin
 for v_user in select user_id from private.match_queue where city_id=p_city and expires_at<=now() loop
  perform private.record_presence(v_user,p_city,'offline','expired');
 end loop;
 delete from private.match_queue where city_id=p_city and expires_at<=now();
 for v_id in select m.id from public.meetups m join private.meetup_details d on d.meetup_id=m.id
  where m.city_id=p_city and m.status='draft' and d.proposal_expires_at<=now() for update of m loop
  perform private.release_match(v_id);
 end loop;
 for v_id in select id from public.meetups where city_id=p_city and status='confirmed' and ends_at<=now() for update loop
  insert into private.match_cooldowns(first_id,second_id,expires_at)
   select least(m.host_id,p.user_id),greatest(m.host_id,p.user_id),now()+interval '45 seconds'
   from public.meetups m join public.meetup_participants p on p.meetup_id=m.id and p.user_id<>m.host_id where m.id=v_id
   on conflict(first_id,second_id) do update set expires_at=excluded.expires_at;
  if (select count(*) from private.meetup_responses where meetup_id=v_id and arrived_at is not null)=2 then
   update private.meetup_responses set finished_at=coalesce(finished_at,now()) where meetup_id=v_id;
   update public.meetups set status='completed' where id=v_id;
   update public.meetup_participants set status='completed',completed_at=now() where meetup_id=v_id and status='reserved';
  else
   update private.meetup_details set closure_reason='scheduled_end' where meetup_id=v_id;
   update public.meetups set status='cancelled' where id=v_id;
   update public.meetup_participants p set status=case when r.arrived_at is null then 'no_show' else 'cancelled' end from private.meetup_responses r where p.meetup_id=v_id and p.status='reserved' and r.meetup_id=p.meetup_id and r.user_id=p.user_id;
  end if;
 end loop;
end $$;
create or replace function public.my_profile_stats() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_rating numeric; v_ratings integer; v_attended integer; v_due integer;
begin
 if not private.is_confirmed() then raise exception 'Sign in first'; end if;
 select round(avg(peer.rating),1),count(peer.rating)::integer into v_rating,v_ratings
 from public.meetup_participants p join public.meetups m on m.id=p.meetup_id and m.status='completed'
 join private.meetup_responses peer on peer.meetup_id=m.id and peer.user_id<>v_user
 where p.user_id=v_user and p.status='completed';
 select count(*) filter(where r.arrived_at is not null)::integer,count(*)::integer into v_attended,v_due
 from public.meetup_participants p join public.meetups m on m.id=p.meetup_id
 join private.meetup_responses r on r.meetup_id=m.id and r.user_id=v_user
 where p.user_id=v_user and (
   ((m.status in ('confirmed','completed') or (m.status='cancelled' and exists(select 1 from private.meetup_details d where d.meetup_id=m.id and d.closure_reason='scheduled_end'))) and (m.ends_at<=now() or r.arrived_at is not null))
   or p.status='no_show'
 );
 return jsonb_build_object(
   'completed_meetups',coalesce((select completed_meetups from private.member_access where user_id=v_user),0),
   'rating',v_rating,'rating_count',v_ratings,
   'show_up_percent',case when v_due>0 then round(100.0*v_attended/v_due)::integer else null end
 );
end $$;
create or replace function private.live_state_snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_city uuid; v_result jsonb;
begin
 if not private.is_confirmed() then raise exception 'Sign in first'; end if;
 select home_city_id into v_city from public.profiles where id=v_user;
 if v_city is not null then
  perform pg_advisory_xact_lock(hashtextextended('meetup-city:'||v_city::text,0));
  perform private.expire_matches(v_city);
 end if;
 select jsonb_build_object('stats',(select jsonb_build_object('first',count(*),'coffee',count(distinct case when d.intent='coffee' then orr.user_id end),'explorer',count(distinct m.venue_id),'owl',count(*) filter(where extract(hour from m.starts_at at time zone c.timezone)>=21),'early',count(*) filter(where extract(hour from m.starts_at at time zone c.timezone)<8)) from public.meetups m join public.meetup_participants p on p.meetup_id=m.id and p.user_id=v_user and p.status='completed' join private.meetup_details d on d.meetup_id=m.id join private.meetup_responses orr on orr.meetup_id=m.id and orr.user_id<>v_user join public.cities c on c.id=m.city_id),'friends',coalesce((select jsonb_agg(f) from (select p.id,p.display_name name,case when exists(select 1 from private.match_queue where user_id=p.id) then 'free' else 'offline' end status from private.friendships fs join public.profiles p on p.id=case when fs.first_id=v_user then fs.second_id else fs.first_id end where (fs.first_id=v_user or fs.second_id=v_user) and not exists(select 1 from private.member_blocks second_id where (second_id.blocker_id=v_user and second_id.blocked_id=p.id) or (second_id.blocker_id=p.id and second_id.blocked_id=v_user))) f),'[]'::jsonb),'settings',coalesce((select to_jsonb(s)-'user_id'-'approx_lat'-'approx_lon' from private.member_settings s where s.user_id=v_user),'{}'::jsonb),'blocked_count',(select count(*) from private.member_blocks where blocker_id=v_user),'messages',coalesce((select jsonb_agg(messages) from (select msg.id,msg.body text,case when msg.user_id=v_user then 'me' else 'them' end "from" from private.meetup_messages msg join public.meetups mm on mm.id=msg.meetup_id and mm.status='confirmed' join public.meetup_participants mp on mp.meetup_id=mm.id and mp.user_id=v_user and mp.status='reserved' order by msg.id desc limit 100) messages),'[]'::jsonb),'queue',(select to_jsonb(q)-'user_id' from private.match_queue q where q.user_id=v_user),
 'awaiting_offer',exists(select 1 from public.meetups wm join public.meetup_participants wp on wp.meetup_id=wm.id and wp.user_id=v_user and wp.status='reserved' join private.meetup_responses wr on wr.meetup_id=wm.id and wr.user_id=wm.host_id where wm.status='draft' and wm.host_id<>v_user and wr.accepted_at is null),
 'meetup',(select jsonb_build_object('id',m.id,'status',m.status,'creation_type',m.creation_type,'starts_at',m.starts_at,'ends_at',m.ends_at,
 'intent',d.intent,'proposal_expires_at',d.proposal_expires_at,'venue',case when v.id is null then null else jsonb_build_object('name',v.name,'address',v.address) end,
 'note',coalesce((select note from private.availability_details where user_id=op.id),''),'other_name',op.display_name,'other_id',op.id,'other_age',(select case when (s.prefs->>'hideAge')::boolean then null else s.age end from private.member_settings s where s.user_id=op.id),'other_interests',coalesce((select to_jsonb(s.interests) from private.member_settings s where s.user_id=op.id),'[]'::jsonb),'other_verified',(select id_status='approved' from private.member_access where user_id=op.id),'other_rating',(select round(avg(peer.rating),1) from public.meetup_participants rp join public.meetups rm on rm.id=rp.meetup_id and rm.status='completed' join private.meetup_responses peer on peer.meetup_id=rm.id and peer.user_id<>op.id where rp.user_id=op.id and rp.status='completed'),'other_show_up_percent',(
   select case when count(*)>0 then round(100.0*count(*) filter(where rr.arrived_at is not null)/count(*))::integer else null end
   from public.meetup_participants pp join public.meetups mm on mm.id=pp.meetup_id
   join private.meetup_responses rr on rr.meetup_id=mm.id and rr.user_id=op.id
   where pp.user_id=op.id and ((((mm.status in ('confirmed','completed') or (mm.status='cancelled' and exists(select 1 from private.meetup_details dd where dd.meetup_id=mm.id and dd.closure_reason='scheduled_end'))) and (mm.ends_at<=now() or rr.arrived_at is not null))) or pp.status='no_show')
  ),'accepted',r.accepted_at is not null,'arrived',r.arrived_at is not null,'finished',r.finished_at is not null,
 'other_accepted',orr.accepted_at is not null,'other_arrived',orr.arrived_at is not null,'other_finished',orr.finished_at is not null)
 from public.meetups m join public.meetup_participants p on p.meetup_id=m.id and p.user_id=v_user and p.status='reserved'
 join private.meetup_details d on d.meetup_id=m.id left join public.venues v on v.id=m.venue_id
 join private.meetup_responses r on r.meetup_id=m.id and r.user_id=v_user
 join private.meetup_responses orr on orr.meetup_id=m.id and orr.user_id<>v_user
 join public.profiles op on op.id=orr.user_id
 where m.status<>'draft' or m.host_id=v_user or exists(select 1 from private.meetup_responses first_response where first_response.meetup_id=m.id and first_response.user_id=m.host_id and first_response.accepted_at is not null)),
 'history',coalesce((select jsonb_agg(h) from (select m.id,m.status,m.creation_type,m.starts_at,m.ends_at,v.name venue,d.intent,r.rating,(select display_name from public.profiles op join private.meetup_responses orr on orr.user_id=op.id where orr.meetup_id=m.id and orr.user_id<>v_user) other_name
 from public.meetups m join public.meetup_participants p on p.meetup_id=m.id and p.user_id=v_user and p.status<>'reserved'
 left join public.venues v on v.id=m.venue_id join private.meetup_details d on d.meetup_id=m.id
 join private.meetup_responses r on r.meetup_id=m.id and r.user_id=v_user order by m.starts_at desc limit 20) h),'[]'::jsonb)) into v_result;
 return v_result;
end $$;
create or replace function public.my_live_state() returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb;
begin
 s:=private.live_state_snapshot();
 if s->'queue'<>'null'::jsonb then
  perform public.meetup_command('retry');
  s:=private.live_state_snapshot();
 end if;
 return s||jsonb_build_object('profile_stats',public.my_profile_stats(), 'feedback_pending',(select jsonb_build_object('id',m.id,'status',m.status) from public.meetups m join private.meetup_details d on d.meetup_id=m.id join private.meetup_responses r on r.meetup_id=m.id and r.user_id=auth.uid() where r.feedback_ack_at is null and (m.status='completed' or (m.status='cancelled' and d.closure_reason='scheduled_end')) order by m.ends_at desc limit 1));
end $$;
create or replace function public.notification_recipients(p_user uuid) returns table(user_id uuid)
language sql stable security definer set search_path='' as $$
 with latest as (
  select m.id from public.meetups m join public.meetup_participants p on p.meetup_id=m.id
  where p.user_id=p_user order by m.created_at desc,m.id desc limit 1
 )
 select p_user where p_user is not null
 union
 select p.user_id from public.meetup_participants p join latest m on m.id=p.meetup_id
 union
 select j.user_id from private.notification_jobs j where j.kind='friend_push' and j.state='pending' and j.event_key like 'friend-online:'||p_user::text||':%';
$$;
create function public.complete_meetup_feedback(p_meetup uuid,p_rating integer default null,p_met boolean default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_city uuid; v_status text; v_reason text; q private.meetup_queue_snapshots;
begin
 if not private.is_confirmed() then raise exception 'Sign in first'; end if;
 select city_id into v_city from public.meetups where id=p_meetup;
 if v_city is null then raise exception 'Meetup not found'; end if;
 perform pg_advisory_xact_lock(hashtextextended('meetup-city:'||v_city::text,0));
 perform private.expire_matches(v_city);
 select m.status,d.closure_reason into v_status,v_reason
 from public.meetups m join private.meetup_details d on d.meetup_id=m.id
 join private.meetup_responses r on r.meetup_id=m.id and r.user_id=v_user
 where m.id=p_meetup and r.feedback_ack_at is null for update of m;
 if not found or not (v_status='completed' or (v_status='cancelled' and v_reason='scheduled_end'))
   then raise exception 'Feedback is not pending for this meetup'; end if;
 if v_status='completed' and (p_rating is null or p_rating not between 1 and 5 or p_met is not null)
   then raise exception 'Choose a rating from 1 to 5'; end if;
 if v_status='cancelled' and (p_met is null or p_rating is not null)
   then raise exception 'Tell us whether you met'; end if;
 update private.meetup_responses set rating=p_rating,feedback_met=coalesce(p_met,true),feedback_ack_at=now()
   where meetup_id=p_meetup and user_id=v_user;
 select * into q from private.meetup_queue_snapshots where meetup_id=p_meetup and user_id=v_user;
 if q.user_id is not null and private.can_queue(v_user,q.city_id) then
  insert into private.match_queue(user_id,city_id,venue_id,intent,duration_min,expires_at,created_at,audience)
  values(q.user_id,q.city_id,q.venue_id,q.intent,q.duration_min,
   now()+make_interval(mins=>coalesce((select window_min from private.availability_details where user_id=v_user),q.duration_min)),
   now(),coalesce((select audience from private.member_settings where user_id=v_user),'both'))
  on conflict(user_id) do nothing;
  perform private.record_presence(v_user,q.city_id,'online','manual');
  perform public.meetup_command('retry');
 end if;
end $$;
revoke all on function public.complete_meetup_feedback(uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.complete_meetup_feedback(uuid,integer,boolean) to authenticated;
notify pgrst, 'reload schema';
commit;
