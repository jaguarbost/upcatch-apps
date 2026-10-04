-- Append-only presence transitions. Counts start when this migration is applied.
begin;
create table private.member_presence(user_id uuid primary key references public.profiles(id),city_id uuid not null references public.cities(id),status text not null check(status in ('online','offline')),changed_at timestamptz not null default now());
create table private.presence_events(id bigint generated always as identity primary key,user_id uuid not null references public.profiles(id),city_id uuid not null references public.cities(id),event text not null check(event in ('online','offline')),reason text not null check(reason in ('manual','cancelled','expired','completed')),occurred_at timestamptz not null default now());
create index presence_events_member_time on private.presence_events(user_id,occurred_at desc,id desc);
create index presence_events_city_time on private.presence_events(city_id,occurred_at desc);
alter table private.member_presence enable row level security;
alter table private.presence_events enable row level security;
revoke all on private.member_presence,private.presence_events from public,anon,authenticated;
grant select on private.member_presence,private.presence_events to service_role;
insert into private.member_presence(user_id,city_id,status) select p.id,p.home_city_id,'online' from public.profiles p where p.home_city_id is not null and (exists(select 1 from private.match_queue where user_id=p.id) or exists(select 1 from public.meetup_participants where user_id=p.id and status='reserved'));
create function private.record_presence(p_user uuid,p_city uuid,p_status text,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare v_status text;
begin
 insert into private.member_presence(user_id,city_id,status) values(p_user,p_city,'offline') on conflict do nothing;
 select status into v_status from private.member_presence where user_id=p_user for update;
 if v_status=p_status then return; end if;
 update private.member_presence set status=p_status,city_id=p_city,changed_at=now() where user_id=p_user;
 insert into private.presence_events(user_id,city_id,event,reason) values(p_user,p_city,p_status,p_reason);
end $$;
create function private.record_meetup_presence() returns trigger language plpgsql security definer set search_path='' as $$
declare v_city uuid;
begin
 if new.status in ('cancelled','completed') and old.status='reserved' then
  select city_id into v_city from public.meetups where id=new.meetup_id;
  perform private.record_presence(new.user_id,v_city,'offline',case when new.status='completed' then 'completed' else 'cancelled' end);
 end if;
 return new;
end $$;
create trigger meetup_presence after update of status on public.meetup_participants for each row execute function private.record_meetup_presence();
create function public.my_presence_stats() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.is_confirmed() then raise exception 'Sign in first'; end if;
 return jsonb_build_object('online_count',(select count(*) from private.presence_events where user_id=auth.uid() and event='online'),'offline_count',(select count(*) from private.presence_events where user_id=auth.uid() and event='offline'),'manual_offline_count',(select count(*) from private.presence_events where user_id=auth.uid() and event='offline' and reason='manual'),'status',coalesce((select status from private.member_presence where user_id=auth.uid()),'offline'),'changed_at',(select changed_at from private.member_presence where user_id=auth.uid()),'recent',coalesce((select jsonb_agg(e) from (select event,reason,occurred_at from private.presence_events where user_id=auth.uid() order by id desc limit 50)e),'[]'::jsonb));
end $$;
revoke execute on function private.record_presence(uuid,uuid,text,text),private.record_meetup_presence(),public.my_presence_stats() from public,anon,authenticated;
grant execute on function public.my_presence_stats() to authenticated;
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
  perform private.record_presence(v_user,v_city,'offline','manual');
 elsif p_command='live' then
  if v_meetup.id is not null then raise exception 'You already have first_id meetup'; end if;
  select * into v_access from private.member_access where user_id=v_user for update;
  if v_access.id_status<>'approved' and (v_access.completed_meetups+v_access.reserved_meetups>=3 or v_access.id_status='revoked') then raise exception 'ID approval is required before your next meetup'; end if;
  if not exists(select 1 from public.cities where id=v_city and status='active') then raise exception 'Your city is not available for matching'; end if;
  if p_venue is not null and not exists(select 1 from public.venues v join public.cities c on c.id=v.city_id
    where v.id=p_venue and v.city_id=v_city and v.status in ('listed','approved') and c.status='active') then raise exception 'Choose an available venue in your city'; end if;
  if p_intent not in ('coffee','lunch','walk','drink','networking','explore','chat') or p_intent is null or p_duration not in (15,30,45,60,90,120) or p_duration is null then raise exception 'Choose an intent and duration'; end if;
  perform private.record_presence(v_user,v_city,'online','manual');
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
      and (case coalesce((select audience from private.member_settings where user_id=v_user),'both') when 'both' then true when 'friends' then exists(select 1 from private.friendships where first_id=least(v_user,q.user_id) and second_id=greatest(v_user,q.user_id)) else not exists(select 1 from private.friendships where first_id=least(v_user,q.user_id) and second_id=greatest(v_user,q.user_id)) end)
      and (case q.audience when 'both' then true when 'friends' then exists(select 1 from private.friendships where first_id=least(v_user,q.user_id) and second_id=greatest(v_user,q.user_id)) else not exists(select 1 from private.friendships where first_id=least(v_user,q.user_id) and second_id=greatest(v_user,q.user_id)) end)
      and not exists(select 1 from private.member_settings me join private.member_settings them on them.user_id=q.user_id where me.user_id=v_user and me.approx_lat is not null and them.approx_lat is not null and 6371*2*asin(least(1.0,sqrt(power(sin(radians(them.approx_lat-me.approx_lat)/2),2)+cos(radians(me.approx_lat))*cos(radians(them.approx_lat))*power(sin(radians(them.approx_lon-me.approx_lon)/2),2))))>least(coalesce((select radius_km from private.availability_details where user_id=v_user),3),coalesce((select radius_km from private.availability_details where user_id=q.user_id),3)))
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

create or replace function private.expire_matches(p_city uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_user uuid;
begin
 for v_user in select user_id from private.match_queue where city_id=p_city and expires_at<=now() loop
  perform private.record_presence(v_user,p_city,'offline','expired');
 end loop;
 delete from private.match_queue where city_id=p_city and expires_at<=now();
 for v_id in select m.id from public.meetups m join private.meetup_details d on d.meetup_id=m.id
  where m.city_id=p_city and ((m.status='draft' and d.proposal_expires_at<=now())
   or (m.status='confirmed' and m.ends_at<now()-interval '24 hours')) for update of m
 loop
  for v_user in select user_id from public.meetup_participants where meetup_id=v_id and status='reserved' loop perform private.record_presence(v_user,p_city,'offline','expired'); end loop;
  update public.meetups set status='cancelled' where id=v_id;
  update public.meetup_participants set status='cancelled' where meetup_id=v_id and status='reserved';
 end loop;
end $$;

commit;
