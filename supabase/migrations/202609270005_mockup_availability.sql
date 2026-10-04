-- Preserve the mockup's Free Now toggle, optional venue selection and all intent choices.
begin;
create table private.member_blocks(blocker_id uuid not null references public.profiles(id),blocked_id uuid not null references public.profiles(id),created_at timestamptz not null default now(),primary key(blocker_id,blocked_id),check(blocker_id<>blocked_id));
create index member_blocks_reverse on private.member_blocks(blocked_id,blocker_id);
create table private.meetup_reports(id uuid primary key default gen_random_uuid(),meetup_id uuid not null references public.meetups(id),reporter_id uuid not null references public.profiles(id),reported_id uuid not null references public.profiles(id),reason text not null check(length(reason) between 1 and 500),created_at timestamptz not null default now(),unique(meetup_id,reporter_id));
revoke all on private.member_blocks,private.meetup_reports from public,anon,authenticated;
grant select,update on private.meetup_reports to service_role;
alter table private.match_queue alter column venue_id drop not null;
alter table private.match_queue drop constraint match_queue_intent_check;
alter table private.match_queue add constraint match_queue_intent_check check(intent in ('coffee','lunch','walk','drink','networking','explore','chat'));
alter table private.match_queue drop constraint match_queue_duration_min_check;
alter table private.match_queue add constraint match_queue_duration_min_check check(duration_min in (15,30,45,60,90,120));
create or replace function public.meetup_command(p_command text,p_venue uuid default null,p_intent text default null,p_duration integer default 30,p_rating integer default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_city uuid; v_other uuid; v_meetup public.meetups; v_access private.member_access; v_id uuid; v_duration integer; v_venue uuid;
begin
 if not private.is_confirmed() then raise exception 'Confirm your email first'; end if;
 select home_city_id into v_city from public.profiles where id=v_user and onboarding_completed_at is not null;
 if v_city is null then raise exception 'Complete your profile and choose a city'; end if;
 -- Serialize matching within each city. Ledger constraints also prevent global double booking.
 perform pg_advisory_xact_lock(hashtextextended('meetup-city:'||v_city::text,0));
 perform private.expire_matches(v_city);
 select m.* into v_meetup from public.meetups m join public.meetup_participants p on p.meetup_id=m.id
  where p.user_id=v_user and p.status='reserved' for update of m;
 if p_command='offline' then
  delete from private.match_queue where user_id=v_user;
  if v_meetup.id is not null then raise exception 'Cancel your meetup first'; end if;
 elsif p_command='live' then
  if v_meetup.id is not null then raise exception 'You already have a meetup'; end if;
  select * into v_access from private.member_access where user_id=v_user for update;
  if v_access.id_status<>'approved' and (v_access.completed_meetups+v_access.reserved_meetups>=3 or v_access.id_status='revoked') then raise exception 'ID approval is required before your next meetup'; end if;
  if not exists(select 1 from public.cities where id=v_city and status='active') then raise exception 'Your city is not available for matching'; end if;
  if p_venue is not null and not exists(select 1 from public.venues v join public.cities c on c.id=v.city_id
    where v.id=p_venue and v.city_id=v_city and v.status in ('listed','approved') and c.status='active') then raise exception 'Choose an available venue in your city'; end if;
  if p_intent not in ('coffee','lunch','walk','drink','networking','explore','chat') or p_intent is null or p_duration not in (15,30,45,60,90,120) or p_duration is null then raise exception 'Choose an intent and duration'; end if;
  delete from private.match_queue where user_id=v_user;
  select q.user_id,least(q.duration_min,p_duration),q.venue_id into v_other,v_duration,v_venue from private.match_queue q
    join private.member_access a on a.user_id=q.user_id
    where q.city_id=v_city and (q.venue_id=p_venue or q.venue_id is null or p_venue is null) and q.intent=p_intent and q.user_id<>v_user and q.expires_at>now()
      and (q.venue_id is null or exists(select 1 from public.venues v where v.id=q.venue_id and v.city_id=v_city and v.status in ('listed','approved')))
      and not exists(select 1 from private.member_blocks b where (b.blocker_id=v_user and b.blocked_id=q.user_id) or (b.blocker_id=q.user_id and b.blocked_id=v_user))
      and a.account_status='active' and a.reserved_meetups=0 and (a.id_status='approved' or (a.id_status<>'revoked' and a.completed_meetups<3))
      and exists(select 1 from auth.users u where u.id=q.user_id and u.email_confirmed_at is not null)
    order by q.created_at limit 1 for update of q;
  if v_other is null then
    insert into private.match_queue(user_id,city_id,venue_id,intent,duration_min,expires_at)
    values(v_user,v_city,p_venue,p_intent,p_duration,now()+make_interval(mins=>p_duration));
  else
    v_venue:=coalesce(p_venue,v_venue);
    if v_venue is null then
      select id into v_venue from public.venues where city_id=v_city and status in ('listed','approved') order by name limit 1;
    end if;
    if v_venue is null then raise exception 'No public venues are available in your city'; end if;
    insert into public.meetups(city_id,venue_id,host_id,starts_at,ends_at,status)
    values(v_city,v_venue,v_other,now(),now()+make_interval(mins=>v_duration),'draft') returning id into v_id;
    insert into private.meetup_details values(v_id,p_intent,now()+interval '5 minutes');
    insert into public.meetup_participants(meetup_id,user_id,status)
      select v_id,u,'reserved' from unnest(array[v_user,v_other]) u order by u;
    insert into private.meetup_responses(meetup_id,user_id) values(v_id,v_user),(v_id,v_other);
    delete from private.match_queue where user_id in (v_user,v_other);
  end if;
 elsif p_command='rate' then
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'Choose a rating from 1 to 5'; end if;
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

create function public.report_current_meetup(p_reason text,p_block boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_meetup uuid; v_city uuid; v_other uuid;
begin
 if not private.is_confirmed() then raise exception 'Sign in first'; end if;
 if p_reason is null or length(trim(p_reason)) not between 1 and 500 then raise exception 'Choose a report reason'; end if;
 select m.id,m.city_id into v_meetup,v_city from public.meetups m join public.meetup_participants p on p.meetup_id=m.id where p.user_id=v_user and p.status='reserved';
 if v_meetup is null then raise exception 'No active meetup'; end if;
 perform pg_advisory_xact_lock(hashtextextended('meetup-city:'||v_city::text,0));
 perform 1 from public.meetups m where m.id=v_meetup for update;
 if not exists(select 1 from public.meetup_participants where meetup_id=v_meetup and user_id=v_user and status='reserved') then raise exception 'No active meetup'; end if;
 select user_id into v_other from public.meetup_participants where meetup_id=v_meetup and user_id<>v_user;
 if v_other is null then raise exception 'Meetup participant unavailable'; end if;
 insert into private.meetup_reports(meetup_id,reporter_id,reported_id,reason) values(v_meetup,v_user,v_other,trim(p_reason)) on conflict(meetup_id,reporter_id) do nothing;
 if p_block then insert into private.member_blocks(blocker_id,blocked_id) values(v_user,v_other) on conflict do nothing; end if;
 update public.meetups set status='cancelled' where id=v_meetup;
 update public.meetup_participants set status='cancelled' where meetup_id=v_meetup and status='reserved';
end $$;
revoke execute on function public.report_current_meetup(text,boolean) from public,anon;
grant execute on function public.report_current_meetup(text,boolean) to authenticated;
alter table private.member_blocks enable row level security;
alter table private.meetup_reports enable row level security;
commit;
