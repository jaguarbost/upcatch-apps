-- Friend requests are bound to real shared meetups; QR scanning is excluded.
begin;
create table private.friend_votes(meetup_id uuid not null references public.meetups(id),user_id uuid not null references public.profiles(id),created_at timestamptz not null default now(),primary key(meetup_id,user_id));
revoke all on private.friend_votes,private.friendships from public,anon,authenticated;
create function public.friend_from_meetup(p_meetup uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_other uuid;v_city uuid;
begin
 if not private.is_confirmed() then raise exception 'Sign in first'; end if;
 select m.city_id into v_city from public.meetups m join public.meetup_participants p on p.meetup_id=m.id and p.user_id=v_user where m.id=p_meetup and (m.status='completed' or (m.status='confirmed' and (select count(*) from private.meetup_responses where meetup_id=m.id and arrived_at is not null)=2));
 if v_city is null then raise exception 'Meet in person first'; end if;
 perform pg_advisory_xact_lock(hashtextextended('meetup-city:'||v_city::text,0));
 select user_id into v_other from public.meetup_participants where meetup_id=p_meetup and user_id<>v_user;
 if v_other is null or exists(select 1 from private.member_blocks where (blocker_id=v_user and blocked_id=v_other) or (blocker_id=v_other and blocked_id=v_user)) then raise exception 'Friend request unavailable'; end if;
 insert into private.friend_votes(meetup_id,user_id) values(p_meetup,v_user) on conflict do nothing;
 if exists(select 1 from private.friend_votes where meetup_id=p_meetup and user_id=v_other) then
  insert into private.friendships(first_id,second_id) values(least(v_user,v_other),greatest(v_user,v_other)) on conflict do nothing;
  return true;
 end if;
 return false;
end $$;
create function public.remove_friend(p_user uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_confirmed() then raise exception 'Sign in first'; end if;
 delete from private.friendships where first_id=least(auth.uid(),p_user) and second_id=greatest(auth.uid(),p_user);
 delete from private.friend_votes where meetup_id in (select own.meetup_id from public.meetup_participants own join public.meetup_participants other on other.meetup_id=own.meetup_id and other.user_id=p_user where own.user_id=auth.uid()) and user_id=auth.uid();
end $$;
create function public.my_blocked_members() returns table(id uuid,name text) language sql security definer set search_path='' as $$
 select p.id,p.display_name from private.member_blocks blocks join public.profiles p on p.id=blocks.blocked_id where blocks.blocker_id=auth.uid() and private.is_confirmed()
$$;
create function public.unblock_member(p_user uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_confirmed() then raise exception 'Sign in first'; end if;
 delete from private.member_blocks where blocker_id=auth.uid() and blocked_id=p_user;
end $$;
revoke execute on function public.friend_from_meetup(uuid),public.remove_friend(uuid),public.my_blocked_members(),public.unblock_member(uuid) from public,anon;
grant execute on function public.friend_from_meetup(uuid),public.remove_friend(uuid),public.my_blocked_members(),public.unblock_member(uuid) to authenticated;
create or replace function public.my_live_state() returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_city uuid; v_result jsonb;
begin
 if not private.is_confirmed() then raise exception 'Sign in first'; end if;
 select home_city_id into v_city from public.profiles where id=v_user;
 if v_city is not null then
  perform pg_advisory_xact_lock(hashtextextended('meetup-city:'||v_city::text,0));
  perform private.expire_matches(v_city);
 end if;
 select jsonb_build_object('friends',coalesce((select jsonb_agg(f) from (select p.id,p.display_name name,case when exists(select 1 from private.match_queue where user_id=p.id) then 'free' else 'offline' end status from private.friendships fs join public.profiles p on p.id=case when fs.first_id=v_user then fs.second_id else fs.first_id end where (fs.first_id=v_user or fs.second_id=v_user) and not exists(select 1 from private.member_blocks second_id where (second_id.blocker_id=v_user and second_id.blocked_id=p.id) or (second_id.blocker_id=p.id and second_id.blocked_id=v_user))) f),'[]'::jsonb),'settings',coalesce((select to_jsonb(s)-'user_id'-'approx_lat'-'approx_lon' from private.member_settings s where s.user_id=v_user),'{}'::jsonb),'blocked_count',(select count(*) from private.member_blocks where blocker_id=v_user),'messages',coalesce((select jsonb_agg(messages) from (select msg.id,msg.body text,case when msg.user_id=v_user then 'me' else 'them' end "from" from private.meetup_messages msg join public.meetups mm on mm.id=msg.meetup_id and mm.status='confirmed' join public.meetup_participants mp on mp.meetup_id=mm.id and mp.user_id=v_user and mp.status='reserved' order by msg.id desc limit 100) messages),'[]'::jsonb),'queue',(select to_jsonb(q)-'user_id' from private.match_queue q where q.user_id=v_user),
 'awaiting_offer',exists(select 1 from public.meetups wm join public.meetup_participants wp on wp.meetup_id=wm.id and wp.user_id=v_user and wp.status='reserved' join private.meetup_responses wr on wr.meetup_id=wm.id and wr.user_id=wm.host_id where wm.status='draft' and wm.host_id<>v_user and wr.accepted_at is null),
 'meetup',(select jsonb_build_object('id',m.id,'status',m.status,'starts_at',m.starts_at,'ends_at',m.ends_at,
 'intent',d.intent,'proposal_expires_at',d.proposal_expires_at,'venue',jsonb_build_object('name',v.name,'address',v.address),
 'other_name',op.display_name,'other_id',op.id,'other_age',(select case when (s.prefs->>'hideAge')::boolean then null else s.age end from private.member_settings s where s.user_id=op.id),'other_interests',coalesce((select to_jsonb(s.interests) from private.member_settings s where s.user_id=op.id),'[]'::jsonb),'other_verified',(select id_status='approved' from private.member_access where user_id=op.id),'accepted',r.accepted_at is not null,'arrived',r.arrived_at is not null,'finished',r.finished_at is not null,
 'other_accepted',orr.accepted_at is not null,'other_arrived',orr.arrived_at is not null,'other_finished',orr.finished_at is not null)
 from public.meetups m join public.meetup_participants p on p.meetup_id=m.id and p.user_id=v_user and p.status='reserved'
 join private.meetup_details d on d.meetup_id=m.id join public.venues v on v.id=m.venue_id
 join private.meetup_responses r on r.meetup_id=m.id and r.user_id=v_user
 join private.meetup_responses orr on orr.meetup_id=m.id and orr.user_id<>v_user
 join public.profiles op on op.id=orr.user_id
 where m.status<>'draft' or m.host_id=v_user or exists(select 1 from private.meetup_responses first_response where first_response.meetup_id=m.id and first_response.user_id=m.host_id and first_response.accepted_at is not null)),
 'history',coalesce((select jsonb_agg(h) from (select m.id,m.status,m.starts_at,m.ends_at,v.name venue,d.intent,r.rating,(select display_name from public.profiles op join private.meetup_responses orr on orr.user_id=op.id where orr.meetup_id=m.id and orr.user_id<>v_user) other_name
 from public.meetups m join public.meetup_participants p on p.meetup_id=m.id and p.user_id=v_user and p.status<>'reserved'
 join public.venues v on v.id=m.venue_id join private.meetup_details d on d.meetup_id=m.id
 join private.meetup_responses r on r.meetup_id=m.id and r.user_id=v_user order by m.starts_at desc limit 20) h),'[]'::jsonb)) into v_result;
 return v_result;
end $$;
create or replace function public.meetup_command(p_command text,p_venue uuid default null,p_intent text default null,p_duration integer default 30,p_rating integer default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_city uuid; v_other uuid; v_meetup public.meetups; v_access private.member_access; v_id uuid; v_duration integer; v_venue uuid; v_intent text;
begin
 if not private.is_confirmed() then raise exception 'Confirm your email first'; end if;
 select home_city_id into v_city from public.profiles where id=v_user and onboarding_completed_at is not null;
 if v_city is null then raise exception 'Complete your profile and choose first_id city'; end if;
 -- Serialize matching within each city. Ledger constraints also prevent global double booking.
 perform pg_advisory_xact_lock(hashtextextended('meetup-city:'||v_city::text,0));
 perform private.expire_matches(v_city);
 select m.* into v_meetup from public.meetups m join public.meetup_participants p on p.meetup_id=m.id
  where p.user_id=v_user and p.status='reserved' for update of m;
 if p_command='offline' then
  delete from private.match_queue where user_id=v_user;
  if v_meetup.id is not null then raise exception 'Cancel your meetup first'; end if;
 elsif p_command='live' then
  if v_meetup.id is not null then raise exception 'You already have first_id meetup'; end if;
  select * into v_access from private.member_access where user_id=v_user for update;
  if v_access.id_status<>'approved' and (v_access.completed_meetups+v_access.reserved_meetups>=3 or v_access.id_status='revoked') then raise exception 'ID approval is required before your next meetup'; end if;
  if not exists(select 1 from public.cities where id=v_city and status='active') then raise exception 'Your city is not available for matching'; end if;
  if p_venue is not null and not exists(select 1 from public.venues v join public.cities c on c.id=v.city_id
    where v.id=p_venue and v.city_id=v_city and v.status in ('listed','approved') and c.status='active') then raise exception 'Choose an available venue in your city'; end if;
  if p_intent not in ('coffee','lunch','walk','drink','networking','explore','chat') or p_intent is null or p_duration not in (15,30,45,60,90,120) or p_duration is null then raise exception 'Choose an intent and duration'; end if;
  delete from private.match_queue where user_id=v_user;
  select q.user_id,least(q.duration_min,p_duration),q.venue_id,q.intent into v_other,v_duration,v_venue,v_intent from private.match_queue q
    join private.member_access first_id on first_id.user_id=q.user_id
    where q.city_id=v_city and q.user_id<>v_user and q.expires_at>now()
      and (q.venue_id is null or exists(select 1 from public.venues v where v.id=q.venue_id and v.city_id=v_city and v.status in ('listed','approved')))
      and not exists(select 1 from private.member_blocks second_id where (second_id.blocker_id=v_user and second_id.blocked_id=q.user_id) or (second_id.blocker_id=q.user_id and second_id.blocked_id=v_user))
      and first_id.account_status='active' and first_id.reserved_meetups=0 and (first_id.id_status='approved' or (first_id.id_status<>'revoked' and first_id.completed_meetups<3))
      and exists(select 1 from auth.users u where u.id=q.user_id and u.email_confirmed_at is not null)
      and (not coalesce((select (prefs->>'verifiedOnly')::boolean from private.member_settings where user_id=v_user),false) or first_id.id_status='approved')
      and (not coalesce((select (prefs->>'verifiedOnly')::boolean from private.member_settings where user_id=q.user_id),false) or v_access.id_status='approved')
      and not exists(select 1 from private.availability_details ad where ad.user_id in (v_user,q.user_id) and 'Verified ID only'=any(ad.preferences) and (first_id.id_status<>'approved' or v_access.id_status<>'approved'))
      and not exists(select 1 from private.availability_details ad where ad.user_id in (v_user,q.user_id) and 'Similar age'=any(ad.preferences) and not exists(select 1 from private.member_settings me join private.member_settings them on them.user_id=q.user_id where me.user_id=v_user and abs(me.age-them.age)<=5))
      and not exists(select 1 from private.availability_details ad where ad.user_id in (v_user,q.user_id) and 'Shared interests'=any(ad.preferences) and not exists(select 1 from private.member_settings me join private.member_settings them on them.user_id=q.user_id where me.user_id=v_user and me.interests && them.interests))
    order by case when coalesce((select (prefs->>'friendsFirst')::boolean from private.member_settings where user_id=v_user),false) and exists(select 1 from private.friendships where first_id=least(v_user,q.user_id) and second_id=greatest(v_user,q.user_id)) then 0 else 1 end,q.created_at limit 1 for update of q;
  if v_other is null then
    insert into private.match_queue(user_id,city_id,venue_id,intent,duration_min,expires_at)
    values(v_user,v_city,p_venue,p_intent,p_duration,now()+make_interval(mins=>p_duration));
  else
    v_venue:=coalesce(v_venue,p_venue);
    if v_venue is null then
      select id into v_venue from public.venues where city_id=v_city and status in ('listed','approved') order by name limit 1;
    end if;
    if v_venue is null then raise exception 'No public venues are available in your city'; end if;
    insert into public.meetups(city_id,venue_id,host_id,starts_at,ends_at,status)
    values(v_city,v_venue,v_other,now(),now()+make_interval(mins=>v_duration),'draft') returning id into v_id;
    insert into private.meetup_details values(v_id,v_intent,now()+interval '5 minutes');
    insert into public.meetup_participants(meetup_id,user_id,status)
      select v_id,u,'reserved' from unnest(array[v_user,v_other]) u order by u;
    insert into private.meetup_responses(meetup_id,user_id) values(v_id,v_user),(v_id,v_other);
    delete from private.match_queue where user_id in (v_user,v_other);
  end if;
 elsif p_command='rate' then
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'Choose first_id rating from 1 to 5'; end if;
  select m.id into v_id from public.meetups m join public.meetup_participants p on p.meetup_id=m.id
    where p.user_id=v_user and p.status='completed' order by m.ends_at desc limit 1;
  if v_id is null then raise exception 'No completed meetup to rate'; end if;
  update private.meetup_responses set rating=p_rating where meetup_id=v_id and user_id=v_user;
 else
  if v_meetup.id is null then raise exception 'No active meetup'; end if;
  if p_command='cancel' then
    update public.meetups set status='cancelled' where id=v_meetup.id;
    update public.meetup_participants set status='cancelled' where meetup_id=v_meetup.id and status='reserved';
  elsif p_command='accept' then
    if v_meetup.status<>'draft' then raise exception 'Proposal is no longer pending'; end if;
    if v_user<>v_meetup.host_id and not exists(select 1 from private.meetup_responses where meetup_id=v_meetup.id and user_id=v_meetup.host_id and accepted_at is not null) then raise exception 'Waiting for the first person to accept'; end if;
    if v_user=v_meetup.host_id then update private.meetup_details set proposal_expires_at=now()+interval '5 minutes' where meetup_id=v_meetup.id; end if;
    update private.meetup_responses set accepted_at=coalesce(accepted_at,now()) where meetup_id=v_meetup.id and user_id=v_user;
    if (select count(*) from private.meetup_responses where meetup_id=v_meetup.id and accepted_at is not null)=2 then
      update public.meetups set status='confirmed',starts_at=now(),ends_at=now()+(v_meetup.ends_at-v_meetup.starts_at) where id=v_meetup.id;
    end if;
  elsif p_command='arrive' then
    if v_meetup.status<>'confirmed' then raise exception 'Both people must accept first'; end if;
    update private.meetup_responses set arrived_at=coalesce(arrived_at,now()) where meetup_id=v_meetup.id and user_id=v_user;
  elsif p_command='finish' then
    if v_meetup.status<>'confirmed' or v_meetup.ends_at>now() then raise exception 'Wait until the scheduled meetup ends'; end if;
    if (select count(*) from private.meetup_responses where meetup_id=v_meetup.id and arrived_at is not null)<>2 then raise exception 'Both people must confirm arrival'; end if;
    update private.meetup_responses set finished_at=coalesce(finished_at,now()) where meetup_id=v_meetup.id and user_id=v_user;
    if (select count(*) from private.meetup_responses where meetup_id=v_meetup.id and finished_at is not null)=2 then
      update public.meetups set status='completed' where id=v_meetup.id;
      update public.meetup_participants set status='completed',completed_at=now() where meetup_id=v_meetup.id and status='reserved';
    end if;
  else raise exception 'Unknown meetup action'; end if;
 end if;
end $$;

create function private.queue_friend_online() returns trigger language plpgsql security definer set search_path='' as $$
declare v_friend uuid;
begin
 if not coalesce((select (prefs->>'notifyFriends')::boolean from private.member_settings where user_id=new.user_id),false) then return new; end if;
 for v_friend in select case when first_id=new.user_id then second_id else first_id end from private.friendships where first_id=new.user_id or second_id=new.user_id loop
  if coalesce((select (prefs->>'friendMeetups')::boolean from private.member_settings where user_id=v_friend),false) and not exists(select 1 from private.member_blocks where (blocker_id=v_friend and blocked_id=new.user_id) or (blocker_id=new.user_id and blocked_id=v_friend)) then
   insert into private.notification_jobs(user_id,event_key,kind,payload) values(v_friend,'friend-online:'||new.user_id||':'||v_friend||':'||date_trunc('hour',now())::text,'friend_push',jsonb_build_object('title','A friend is free','text','One of your friends is online. Open UpCatch to say hello.','expires_at',new.expires_at)) on conflict do nothing;
  end if;
 end loop;
 return new;
end $$;
create trigger friend_online after insert on private.match_queue for each row execute function private.queue_friend_online();
revoke execute on function private.queue_friend_online() from public,anon,authenticated;
alter table private.friend_votes enable row level security;
commit;
