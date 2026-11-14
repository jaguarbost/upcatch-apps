-- Explicit peer no-show reports drive a cautious, capped show-up score.
begin;
alter table private.meetup_responses add column feedback_no_show boolean not null default false;
alter table private.meetup_responses add constraint feedback_no_show_requires_missed
 check(not feedback_no_show or (feedback_met=false and feedback_ack_at is not null));
drop function public.complete_meetup_feedback(uuid,integer,boolean);
create function public.complete_meetup_feedback(p_meetup uuid,p_rating integer default null,p_met boolean default null,p_no_show boolean default false)
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
 if coalesce(p_no_show,false) and (v_status<>'cancelled' or p_met is distinct from false)
   then raise exception 'A no-show report requires a missed meetup'; end if;
 if coalesce(p_no_show,false) and not exists(
   select 1 from private.meetup_responses me
   join private.meetup_responses peer on peer.meetup_id=me.meetup_id and peer.user_id<>me.user_id
   where me.meetup_id=p_meetup and me.user_id=v_user
     and me.arrived_at is not null and peer.arrived_at is null
 ) then raise exception 'Only an arrived member can report a no-show'; end if;
 update private.meetup_responses set rating=p_rating,feedback_met=coalesce(p_met,true),feedback_no_show=coalesce(p_no_show,false),feedback_ack_at=now()
   where meetup_id=p_meetup and user_id=v_user;
 delete from private.match_offer_counts oc where exists(select 1 from private.meetup_responses peer where peer.meetup_id=p_meetup and peer.user_id<>v_user and oc.first_id=least(v_user,peer.user_id) and oc.second_id=greatest(v_user,peer.user_id));
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
create function private.show_up_percent(p_user uuid) returns integer
language sql stable security definer set search_path='' as $$
 with reports as (
  select count(*)::integer n
  from public.meetups m
  join private.meetup_details d on d.meetup_id=m.id and d.closure_reason='scheduled_end'
  join public.meetup_participants target_part on target_part.meetup_id=m.id
    and target_part.user_id=p_user and target_part.status='no_show'
  join private.meetup_responses target on target.meetup_id=m.id
    and target.user_id=p_user and target.arrived_at is null
  join private.meetup_responses reporter on reporter.meetup_id=m.id
    and reporter.user_id<>p_user and reporter.arrived_at is not null
    and reporter.feedback_no_show and reporter.feedback_met=false
    and reporter.feedback_ack_at is not null
  where m.status='cancelled'
 )
 select case
  when coalesce((select completed_meetups from private.member_access where user_id=p_user),0)=0 and n<3 then null
  else greatest(75,100-5*greatest(n-2,0))
 end
 from reports;
$$;
revoke all on function private.show_up_percent(uuid) from public,anon,authenticated;
create or replace function public.my_profile_stats() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_rating numeric; v_ratings integer;
begin
 if not private.is_confirmed() then raise exception 'Sign in first'; end if;
 select round(avg(peer.rating),1),count(peer.rating)::integer into v_rating,v_ratings
 from public.meetup_participants p join public.meetups m on m.id=p.meetup_id and m.status='completed'
 join private.meetup_responses peer on peer.meetup_id=m.id and peer.user_id<>v_user
 where p.user_id=v_user and p.status='completed';
 return jsonb_build_object(
  'completed_meetups',coalesce((select completed_meetups from private.member_access where user_id=v_user),0),
  'rating',v_rating,'rating_count',v_ratings,
  'show_up_percent',private.show_up_percent(v_user)
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
 'note',coalesce((select note from private.availability_details where user_id=op.id),''),'other_name',op.display_name,'other_id',op.id,'other_age',(select case when (s.prefs->>'hideAge')::boolean then null else s.age end from private.member_settings s where s.user_id=op.id),'other_interests',coalesce((select to_jsonb(s.interests) from private.member_settings s where s.user_id=op.id),'[]'::jsonb),'other_verified',(select id_status='approved' from private.member_access where user_id=op.id),'other_rating',(select round(avg(peer.rating),1) from public.meetup_participants rp join public.meetups rm on rm.id=rp.meetup_id and rm.status='completed' join private.meetup_responses peer on peer.meetup_id=rm.id and peer.user_id<>op.id where rp.user_id=op.id and rp.status='completed'),'other_show_up_percent',private.show_up_percent(op.id),'accepted',r.accepted_at is not null,'arrived',r.arrived_at is not null,'finished',r.finished_at is not null,
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
revoke all on function public.complete_meetup_feedback(uuid,integer,boolean,boolean) from public,anon,authenticated;
grant execute on function public.complete_meetup_feedback(uuid,integer,boolean,boolean) to authenticated;
notify pgrst, 'reload schema';
commit;
