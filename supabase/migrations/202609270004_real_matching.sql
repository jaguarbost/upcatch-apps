-- Real matching lifecycle. Apply once after migrations 001-003.
begin;
create table private.match_queue (
 user_id uuid primary key references public.profiles(id), city_id uuid not null references public.cities(id),
 venue_id uuid not null, intent text not null check(intent in ('coffee','lunch','walk','drink')),
 duration_min integer not null check(duration_min in (15,30,45,60,90)),
 expires_at timestamptz not null, created_at timestamptz not null default now(),
 foreign key(venue_id,city_id) references public.venues(id,city_id)
);
create index match_queue_lookup on private.match_queue(city_id,venue_id,intent,created_at);
create table private.meetup_details (
 meetup_id uuid primary key references public.meetups(id), intent text not null,
 proposal_expires_at timestamptz not null
);
create table private.meetup_responses (
 meetup_id uuid not null references public.meetups(id), user_id uuid not null references public.profiles(id),
 accepted_at timestamptz, arrived_at timestamptz, finished_at timestamptz,
 rating integer check(rating between 1 and 5), primary key(meetup_id,user_id)
);
revoke all on private.match_queue,private.meetup_details,private.meetup_responses from public,anon,authenticated;

create function private.expire_matches(p_city uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 delete from private.match_queue where city_id=p_city and expires_at<=now();
 for v_id in select m.id from public.meetups m join private.meetup_details d on d.meetup_id=m.id
  where m.city_id=p_city and ((m.status='draft' and d.proposal_expires_at<=now())
   or (m.status='confirmed' and m.ends_at<now()-interval '24 hours')) for update of m
 loop
  update public.meetups set status='cancelled' where id=v_id;
  update public.meetup_participants set status='cancelled' where meetup_id=v_id and status='reserved';
 end loop;
end $$;

create function public.meetup_command(p_command text,p_venue uuid default null,p_intent text default null,p_duration integer default 30,p_rating integer default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_city uuid; v_other uuid; v_meetup public.meetups; v_access private.member_access; v_id uuid; v_duration integer;
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
  if not exists(select 1 from public.venues v join public.cities c on c.id=v.city_id
    where v.id=p_venue and v.city_id=v_city and v.status in ('listed','approved') and c.status='active') then raise exception 'Choose an available venue in your city'; end if;
  if p_intent not in ('coffee','lunch','walk','drink') or p_intent is null or p_duration not in (15,30,45,60,90) or p_duration is null then raise exception 'Choose an intent and duration'; end if;
  delete from private.match_queue where user_id=v_user;
  select q.user_id,least(q.duration_min,p_duration) into v_other,v_duration from private.match_queue q
    join private.member_access a on a.user_id=q.user_id
    where q.city_id=v_city and q.venue_id=p_venue and q.intent=p_intent and q.user_id<>v_user and q.expires_at>now()
      and a.account_status='active' and a.reserved_meetups=0 and (a.id_status='approved' or (a.id_status<>'revoked' and a.completed_meetups<3))
      and exists(select 1 from auth.users u where u.id=q.user_id and u.email_confirmed_at is not null)
    order by q.created_at limit 1 for update of q;
  if v_other is null then
    insert into private.match_queue(user_id,city_id,venue_id,intent,duration_min,expires_at)
    values(v_user,v_city,p_venue,p_intent,p_duration,now()+interval '30 minutes');
  else
    insert into public.meetups(city_id,venue_id,host_id,starts_at,ends_at,status)
    values(v_city,p_venue,v_other,now(),now()+make_interval(mins=>v_duration),'draft') returning id into v_id;
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

create function public.my_live_state() returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_city uuid; v_result jsonb;
begin
 if not private.is_confirmed() then raise exception 'Sign in first'; end if;
 select home_city_id into v_city from public.profiles where id=v_user;
 if v_city is not null then
  perform pg_advisory_xact_lock(hashtextextended('meetup-city:'||v_city::text,0));
  perform private.expire_matches(v_city);
 end if;
 select jsonb_build_object('queue',(select to_jsonb(q)-'user_id' from private.match_queue q where q.user_id=v_user),
 'meetup',(select jsonb_build_object('id',m.id,'status',m.status,'starts_at',m.starts_at,'ends_at',m.ends_at,
 'intent',d.intent,'proposal_expires_at',d.proposal_expires_at,'venue',jsonb_build_object('name',v.name,'address',v.address),
 'other_name',op.display_name,'accepted',r.accepted_at is not null,'arrived',r.arrived_at is not null,'finished',r.finished_at is not null,
 'other_accepted',orr.accepted_at is not null,'other_arrived',orr.arrived_at is not null,'other_finished',orr.finished_at is not null)
 from public.meetups m join public.meetup_participants p on p.meetup_id=m.id and p.user_id=v_user and p.status='reserved'
 join private.meetup_details d on d.meetup_id=m.id join public.venues v on v.id=m.venue_id
 join private.meetup_responses r on r.meetup_id=m.id and r.user_id=v_user
 join private.meetup_responses orr on orr.meetup_id=m.id and orr.user_id<>v_user
 join public.profiles op on op.id=orr.user_id),
 'history',coalesce((select jsonb_agg(h) from (select m.id,m.status,m.starts_at,m.ends_at,v.name venue,d.intent,r.rating
 from public.meetups m join public.meetup_participants p on p.meetup_id=m.id and p.user_id=v_user and p.status<>'reserved'
 join public.venues v on v.id=m.venue_id join private.meetup_details d on d.meetup_id=m.id
 join private.meetup_responses r on r.meetup_id=m.id and r.user_id=v_user order by m.starts_at desc limit 20) h),'[]'::jsonb)) into v_result;
 return v_result;
end $$;
revoke execute on function private.expire_matches(uuid) from public,anon,authenticated;
revoke execute on function public.meetup_command(text,uuid,text,integer,integer),public.my_live_state() from public,anon;
grant execute on function public.meetup_command(text,uuid,text,integer,integer),public.my_live_state() to authenticated;
commit;
