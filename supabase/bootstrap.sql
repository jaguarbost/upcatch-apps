-- Global accounts, city-scoped inventory. All timestamps are UTC instants.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

create table public.cities (
  id uuid primary key default gen_random_uuid(),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(name) between 1 and 100),
  region_name text,
  timezone text not null,
  status text not null default 'planned' check (status in ('planned','active','paused')),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  created_at timestamptz not null default now(),
  unique (country_code, slug)
);
create index cities_active_idx on public.cities(country_code, name) where status = 'active';

create function private.validate_timezone() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'Invalid IANA timezone';
  end if;
  return new;
end $$;
create trigger city_timezone before insert or update on public.cities
for each row execute function private.validate_timezone();

create table public.neighbourhoods (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id),
  slug text not null,
  name text not null,
  unique(city_id, slug),
  unique(id, city_id)
);
create table public.venues (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id),
  neighbourhood_id uuid,
  slug text not null,
  name text not null,
  address text not null,
  website_url text check(website_url is null or website_url like 'https://%'),
  source_url text,
  source_checked_at date,
  cuisine text,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  check((latitude is null)=(longitude is null)),
  unique(city_id,slug),
  status text not null default 'draft' check(status in ('draft','listed','approved','inactive')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(id, city_id),
  foreign key(neighbourhood_id, city_id) references public.neighbourhoods(id, city_id)
);
create index venues_city_status_idx on public.venues(city_id, status, id);
create index venues_neighbourhood_idx on public.venues(neighbourhood_id, city_id);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check(length(display_name) <= 80),
  adult_declared_at timestamptz,
  home_city_id uuid references public.cities(id),
  photo_path text,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(photo_path is null or photo_path like id::text || '/%'),
  check(onboarding_completed_at is null or
    (length(trim(display_name)) > 0 and adult_declared_at is not null and photo_path is not null))
);
create index profiles_home_city_idx on public.profiles(home_city_id, id) where home_city_id is not null;
create table public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  push_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
create table private.member_access (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  account_status text not null default 'active' check(account_status in ('active','suspended')),
  id_status text not null default 'not_submitted'
    check(id_status in ('not_submitted','pending','approved','rejected','revoked')),
  completed_meetups integer not null default 0 check(completed_meetups >= 0),
  reserved_meetups integer not null default 0 check(reserved_meetups >= 0)
);
create table private.photo_objects (
  path text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  check(path like user_id::text || '/%')
);
create index photo_objects_user_idx on private.photo_objects(user_id);

create function private.bootstrap_member() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id) values(new.id) on conflict do nothing;
  insert into public.notification_preferences(user_id) values(new.id) on conflict do nothing;
  insert into private.member_access(user_id) values(new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function private.bootstrap_member();
-- Also supports existing Supabase users when applying to a nonempty project.
insert into public.profiles(id) select id from auth.users on conflict do nothing;
insert into public.notification_preferences(user_id) select id from public.profiles on conflict do nothing;
insert into private.member_access(user_id) select id from public.profiles on conflict do nothing;

create function private.is_confirmed() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u join private.member_access a on a.user_id = u.id
    where u.id = (select auth.uid()) and u.email_confirmed_at is not null
      and a.account_status = 'active'
  );
$$;
grant execute on function private.is_confirmed() to authenticated;

-- No direct profile writes: validated RPCs constrain the columns and confirmation state.
alter table public.cities enable row level security;
alter table public.neighbourhoods enable row level security;
alter table public.venues enable row level security;
alter table public.profiles enable row level security;
alter table public.notification_preferences enable row level security;
revoke all on public.cities,public.neighbourhoods,public.venues,public.profiles,
  public.notification_preferences from anon,authenticated;
grant select on public.cities,public.neighbourhoods,public.venues,public.profiles,
  public.notification_preferences to authenticated;
create policy cities_read on public.cities for select to authenticated
  using(status = 'active' and (select private.is_confirmed()));
create policy neighbourhoods_read on public.neighbourhoods for select to authenticated
  using((select private.is_confirmed()) and exists(select 1 from public.cities c where c.id = city_id));
create policy venues_read on public.venues for select to authenticated
  using(status in ('listed','approved') and (select private.is_confirmed()) and
    exists(select 1 from public.cities c where c.id = city_id));
create policy profiles_owner on public.profiles for select to authenticated
  using(id = (select auth.uid()) and (select private.is_confirmed()));
create policy preferences_owner on public.notification_preferences for select to authenticated
  using(user_id = (select auth.uid()) and (select private.is_confirmed()));

create function public.save_profile(p_name text, p_adult boolean, p_city uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_confirmed() then raise exception 'Confirmed email required'; end if;
  if length(trim(p_name)) not between 1 and 80 or p_adult is distinct from true then
    raise exception 'Name and adult declaration required';
  end if;
  if p_city is not null and not exists(select 1 from public.cities where id=p_city and status='active') then
    raise exception 'City is not available';
  end if;
  update public.profiles set display_name=trim(p_name),
    adult_declared_at=coalesce(adult_declared_at, now()), home_city_id=p_city, updated_at=now()
    where id=(select auth.uid());
end $$;

create function public.set_push_preference(p_enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_confirmed() then raise exception 'Confirmed email required'; end if;
  update public.notification_preferences set push_enabled=p_enabled,updated_at=now()
    where user_id=(select auth.uid());
end $$;

-- Jobs hold event types, not arbitrary recipient addresses or sensitive payloads.
create table private.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_key text not null unique,
  kind text not null check(kind in ('welcome_email','welcome_push')),
  state text not null default 'pending' check(state in ('pending','processing','sent','skipped','failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  lease_token uuid,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  last_error text
);
create index notification_jobs_due_idx on private.notification_jobs(next_attempt_at, created_at)
  where state in ('pending','processing');

-- Called only by trusted upload handler after image decoding/re-encoding and Storage success.
create function public.finalize_profile_photo(p_user uuid, p_path text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_first boolean;
begin
  perform 1 from public.profiles where id=p_user for update;
  if not exists(select 1 from auth.users u join private.member_access a on a.user_id=u.id
    where u.id=p_user and u.email_confirmed_at is not null and a.account_status='active') then
    raise exception 'Confirmed active account required';
  end if;
  if p_path not like p_user::text || '/%' or not exists(
    select 1 from storage.objects where bucket_id='profile-photos' and name=p_path
  ) then raise exception 'Photo object missing'; end if;
  if not exists(select 1 from public.profiles where id=p_user and length(trim(display_name))>0
    and adult_declared_at is not null) then raise exception 'Complete profile details first'; end if;
  select onboarding_completed_at is null into v_first from public.profiles where id=p_user;
  insert into private.photo_objects(path,user_id) values(p_path,p_user) on conflict do nothing;
  update public.profiles set photo_path=p_path, onboarding_completed_at=coalesce(onboarding_completed_at,now()),
    updated_at=now() where id=p_user;
  if v_first then
    insert into private.notification_jobs(user_id,event_key,kind)
      values(p_user,'welcome-email:'||p_user,'welcome_email') on conflict do nothing;
  end if;
end $$;

create function public.queue_welcome_push() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_confirmed() then raise exception 'Confirmed email required'; end if;
  if not exists(select 1 from public.notification_preferences where user_id=auth.uid() and push_enabled) then
    raise exception 'Push consent required';
  end if;
  insert into private.notification_jobs(user_id,event_key,kind)
    values(auth.uid(),'welcome-push:'||auth.uid(),'welcome_push') on conflict do nothing;
end $$;

create function public.claim_notification_jobs(p_limit integer default 10,p_user uuid default null)
returns setof private.notification_jobs language sql security definer set search_path = '' as $$
  with due as (
    select id from private.notification_jobs
    where ((state='pending' and next_attempt_at<=now()) or (state='processing' and lease_until<now()))
      and attempts<5 and (p_user is null or user_id=p_user)
    order by created_at for update skip locked limit greatest(1,least(p_limit,25))
  )
  update private.notification_jobs j set state='processing',attempts=attempts+1,
    lease_until=now()+interval '5 minutes',lease_token=gen_random_uuid()
  from due where j.id=due.id returning j.*;
$$;
create function public.finish_notification_job(p_id uuid,p_lease uuid,p_state text,p_error text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_state not in ('sent','skipped','pending') then raise exception 'Invalid job state'; end if;
  update private.notification_jobs set
    state=case when p_state='pending' and attempts>=5 then 'failed' else p_state end,
    finished_at=case when p_state in ('sent','skipped') or attempts>=5 then now() else null end,
    next_attempt_at=now()+make_interval(mins=>least(1440, attempts*attempts*5)),
    lease_until=null, lease_token=null,last_error=left(p_error,200)
  where id=p_id and lease_token=p_lease and state='processing';
end $$;

-- Storage remains private and immutable to browser clients.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('profile-photos','profile-photos',false,5242880,array['image/jpeg'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,
allowed_mime_types=excluded.allowed_mime_types;
create policy own_profile_photo on storage.objects for select to authenticated
using(bucket_id='profile-photos' and (select private.is_confirmed()) and
  exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.photo_path=name));
-- There are intentionally no client INSERT/UPDATE/DELETE policies for uploads.

create function public.obsolete_photo_objects(p_limit integer default 50)
returns table(path text) language sql security definer set search_path = '' as $$
  select o.name from storage.objects o
  where o.bucket_id='profile-photos' and o.created_at<now()-interval '1 day'
    and not exists(select 1 from public.profiles p where p.photo_path=o.name)
  order by o.created_at limit greatest(1,least(p_limit,100));
$$;
create function public.prune_notification_jobs() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update private.notification_jobs set state='failed',finished_at=now(),lease_until=null
    where state='processing' and attempts>=5 and lease_until<now();
  delete from private.notification_jobs where finished_at<now()-interval '30 days'
    and state in ('sent','skipped');
  delete from private.photo_objects p where not exists(
    select 1 from storage.objects o where o.bucket_id='profile-photos' and o.name=p.path);
end $$;

-- Default PUBLIC function EXECUTE must never expose SECURITY DEFINER functions.
revoke execute on all functions in schema private from public,anon,authenticated;
grant execute on function private.is_confirmed() to authenticated;
revoke execute on function public.save_profile(text,boolean,uuid),
 public.set_push_preference(boolean),public.queue_welcome_push(),
 public.finalize_profile_photo(uuid,text), public.claim_notification_jobs(integer,uuid),
 public.finish_notification_job(uuid,uuid,text,text),public.obsolete_photo_objects(integer),
 public.prune_notification_jobs() from public,anon,authenticated;
grant execute on function public.save_profile(text,boolean,uuid),
 public.set_push_preference(boolean),public.queue_welcome_push() to authenticated;
grant execute on function public.finalize_profile_photo(uuid,text),
 public.claim_notification_jobs(integer,uuid),public.finish_notification_job(uuid,uuid,text,text),
 public.obsolete_photo_objects(integer),public.prune_notification_jobs() to service_role;
grant all on all tables in schema public,private to service_role;
commit;

-- Future meetup backend foundation. No public mutation endpoints are enabled.
begin;
create table public.meetups (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id),
  venue_id uuid not null,
  host_id uuid not null references public.profiles(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'draft' check(status in ('draft','confirmed','completed','cancelled')),
  created_at timestamptz not null default now(),
  foreign key(venue_id,city_id) references public.venues(id,city_id),
  check(ends_at>starts_at)
);
create index meetups_city_feed_idx on public.meetups(city_id,status,starts_at,id);
create index meetups_host_idx on public.meetups(host_id,starts_at);
create table public.meetup_participants (
  meetup_id uuid not null references public.meetups(id),
  user_id uuid not null references public.profiles(id),
  status text not null check(status in ('reserved','completed','cancelled','no_show')),
  completed_at timestamptz,
  primary key(meetup_id,user_id),
  check((status='completed')=(completed_at is not null))
);
create index meetup_participants_user_idx on public.meetup_participants(user_id,status,meetup_id);
-- One active confirmed meetup per member, across ALL cities.
create unique index one_reserved_meetup_per_member on public.meetup_participants(user_id) where status='reserved';
alter table public.meetups enable row level security;
alter table public.meetup_participants enable row level security;
revoke all on public.meetups,public.meetup_participants from anon,authenticated;
grant select on public.meetups,public.meetup_participants to authenticated;
create policy own_participation on public.meetup_participants for select to authenticated
using(user_id=(select auth.uid()) and (select private.is_confirmed()));
create policy participant_meetup on public.meetups for select to authenticated
using((select private.is_confirmed()) and (host_id=(select auth.uid()) or exists(
  select 1 from public.meetup_participants p where p.meetup_id=id and p.user_id=(select auth.uid()))));

-- Trigger is the authoritative ledger. Counts are global, not reset by changing city.
create function private.enforce_meetup_allowance() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_access private.member_access;
begin
  if tg_op='UPDATE' and (new.meetup_id<>old.meetup_id or new.user_id<>old.user_id) then
    raise exception 'Participation identity is immutable';
  end if;
  select * into v_access from private.member_access where user_id=new.user_id for update;
  if tg_op='INSERT' then
    if new.status<>'reserved' then raise exception 'Participation must start reserved'; end if;
    if v_access.account_status<>'active' or not exists(
      select 1 from auth.users u join public.profiles p on p.id=u.id
      where u.id=new.user_id and u.email_confirmed_at is not null and p.onboarding_completed_at is not null
    ) then raise exception 'Complete verified-email onboarding first'; end if;
    if v_access.id_status<>'approved' and
      (v_access.completed_meetups+v_access.reserved_meetups>=3 or v_access.id_status='revoked') then
      raise exception 'ID verification required';
    end if;
    update private.member_access set reserved_meetups=reserved_meetups+1 where user_id=new.user_id;
  elsif new.status<>old.status then
    if old.status<>'reserved' or new.status not in ('completed','cancelled','no_show') then
      raise exception 'Invalid participation transition';
    end if;
    if new.status='completed' and not exists(
      select 1 from public.meetups where id=new.meetup_id and status='completed' and ends_at<=now()
    ) then raise exception 'Meetup must be completed by the trusted lifecycle first'; end if;
    update private.member_access set reserved_meetups=reserved_meetups-1,
      completed_meetups=completed_meetups+case when new.status='completed' then 1 else 0 end
      where user_id=new.user_id;
  end if;
  return new;
end $$;
create trigger participation_allowance before insert or update on public.meetup_participants
for each row execute function private.enforce_meetup_allowance();

create function public.my_meetup_access()
returns table(completed_meetups integer,reserved_meetups integer,id_status text,id_required boolean)
language sql stable security definer set search_path = '' as $$
  select a.completed_meetups,a.reserved_meetups,a.id_status,
    a.id_status<>'approved' and (a.completed_meetups+a.reserved_meetups>=3 or a.id_status='revoked')
  from private.member_access a where a.user_id=(select auth.uid()) and private.is_confirmed();
$$;
revoke execute on function private.enforce_meetup_allowance() from public,anon,authenticated;
revoke execute on function public.my_meetup_access() from public,anon;
grant execute on function public.my_meetup_access() to authenticated;
grant all on public.meetups,public.meetup_participants to service_role;
-- Participant deletion would bypass the ledger; use status transitions instead.
revoke delete on public.meetup_participants from service_role;
commit;

begin;
alter table private.notification_jobs add column provider_attempted_at timestamptz;
create table private.upload_limits (
  user_id uuid not null references public.profiles(id) on delete cascade,
  window_start timestamptz not null,
  bucket text not null check(bucket in ('minute','day')),
  attempts integer not null default 0,
  primary key(user_id,bucket,window_start)
);
create function public.reserve_photo_upload(p_user uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare minute_start timestamptz := date_trunc('minute',now());
day_start timestamptz := date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,1));
  if coalesce((select attempts from private.upload_limits where user_id=p_user and bucket='minute' and window_start=minute_start),0)>=3
    or coalesce((select attempts from private.upload_limits where user_id=p_user and bucket='day' and window_start=day_start),0)>=20 then
    return false;
  end if;
  insert into private.upload_limits(user_id,window_start,bucket,attempts)
    values(p_user,minute_start,'minute',1),(p_user,day_start,'day',1)
  on conflict(user_id,bucket,window_start) do update set attempts=private.upload_limits.attempts+1;
  return true;
end $$;
-- First provider attempt is recorded BEFORE the network call, including ambiguous timeouts.
create function public.begin_notification_delivery(p_id uuid,p_lease uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare first_attempt timestamptz;
job_kind text;
begin
  select provider_attempted_at,kind into first_attempt,job_kind from private.notification_jobs
    where id=p_id and lease_token=p_lease and state='processing' for update;
  if not found then return false; end if;
  if first_attempt is not null and
    first_attempt < now() - (case when job_kind='welcome_email' then interval '23 hours' else interval '29 days' end) then
    return false;
  end if;
  update private.notification_jobs set provider_attempted_at=coalesce(provider_attempted_at,now()) where id=p_id;
  return true;
end $$;
create or replace function public.finish_notification_job(p_id uuid,p_lease uuid,p_state text,p_error text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_state not in ('sent','skipped','pending','failed') then raise exception 'Invalid job state'; end if;
  update private.notification_jobs set
    state=case when p_state='pending' and attempts>=5 then 'failed' else p_state end,
    finished_at=case when p_state in ('sent','skipped','failed') or attempts>=5 then now() else null end,
    next_attempt_at=now()+make_interval(mins=>least(1440, attempts*attempts*5)),
    lease_until=null,lease_token=null,last_error=left(p_error,200)
  where id=p_id and lease_token=p_lease and state='processing';
end $$;
create or replace function public.prune_notification_jobs() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update private.notification_jobs set state='failed',finished_at=now(),lease_until=null
    where state='processing' and attempts>=5 and lease_until<now();
  -- Keep compact sent/skipped records to retain their unique event keys.
  delete from private.upload_limits where window_start<now()-interval '2 days';
  delete from private.photo_objects p where not exists(
    select 1 from storage.objects o where o.bucket_id='profile-photos' and o.name=p.path);
end $$;
revoke execute on function public.reserve_photo_upload(uuid),public.begin_notification_delivery(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.reserve_photo_upload(uuid),public.begin_notification_delivery(uuid,uuid) to service_role;
grant all on private.upload_limits to service_role;
create index venues_directory_idx on public.venues(city_id,name,id) where status in ('listed','approved');
commit;

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

-- Same-city online pool: oldest queued person receives the offer first.
begin;
create index match_queue_city_fifo on private.match_queue(city_id,created_at);
create or replace function public.meetup_command(p_command text,p_venue uuid default null,p_intent text default null,p_duration integer default 30,p_rating integer default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_city uuid; v_other uuid; v_meetup public.meetups; v_access private.member_access; v_id uuid; v_duration integer; v_venue uuid; v_intent text;
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
  select q.user_id,least(q.duration_min,p_duration),q.venue_id,q.intent into v_other,v_duration,v_venue,v_intent from private.match_queue q
    join private.member_access a on a.user_id=q.user_id
    where q.city_id=v_city and q.user_id<>v_user and q.expires_at>now()
      and (q.venue_id is null or exists(select 1 from public.venues v where v.id=q.venue_id and v.city_id=v_city and v.status in ('listed','approved')))
      and not exists(select 1 from private.member_blocks b where (b.blocker_id=v_user and b.blocked_id=q.user_id) or (b.blocker_id=q.user_id and b.blocked_id=v_user))
      and a.account_status='active' and a.reserved_meetups=0 and (a.id_status='approved' or (a.id_status<>'revoked' and a.completed_meetups<3))
      and exists(select 1 from auth.users u where u.id=q.user_id and u.email_confirmed_at is not null)
    order by q.created_at limit 1 for update of q;
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

create or replace function public.my_live_state() returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_city uuid; v_result jsonb;
begin
 if not private.is_confirmed() then raise exception 'Sign in first'; end if;
 select home_city_id into v_city from public.profiles where id=v_user;
 if v_city is not null then
  perform pg_advisory_xact_lock(hashtextextended('meetup-city:'||v_city::text,0));
  perform private.expire_matches(v_city);
 end if;
 select jsonb_build_object('queue',(select to_jsonb(q)-'user_id' from private.match_queue q where q.user_id=v_user),
 'awaiting_offer',exists(select 1 from public.meetups wm join public.meetup_participants wp on wp.meetup_id=wm.id and wp.user_id=v_user and wp.status='reserved' join private.meetup_responses wr on wr.meetup_id=wm.id and wr.user_id=wm.host_id where wm.status='draft' and wm.host_id<>v_user and wr.accepted_at is null),
 'meetup',(select jsonb_build_object('id',m.id,'status',m.status,'starts_at',m.starts_at,'ends_at',m.ends_at,
 'intent',d.intent,'proposal_expires_at',d.proposal_expires_at,'venue',jsonb_build_object('name',v.name,'address',v.address),
 'other_name',op.display_name,'accepted',r.accepted_at is not null,'arrived',r.arrived_at is not null,'finished',r.finished_at is not null,
 'other_accepted',orr.accepted_at is not null,'other_arrived',orr.arrived_at is not null,'other_finished',orr.finished_at is not null)
 from public.meetups m join public.meetup_participants p on p.meetup_id=m.id and p.user_id=v_user and p.status='reserved'
 join private.meetup_details d on d.meetup_id=m.id join public.venues v on v.id=m.venue_id
 join private.meetup_responses r on r.meetup_id=m.id and r.user_id=v_user
 join private.meetup_responses orr on orr.meetup_id=m.id and orr.user_id<>v_user
 join public.profiles op on op.id=orr.user_id
 where m.status<>'draft' or m.host_id=v_user or exists(select 1 from private.meetup_responses first_response where first_response.meetup_id=m.id and first_response.user_id=m.host_id and first_response.accepted_at is not null)),
 'history',coalesce((select jsonb_agg(h) from (select m.id,m.status,m.starts_at,m.ends_at,v.name venue,d.intent,r.rating
 from public.meetups m join public.meetup_participants p on p.meetup_id=m.id and p.user_id=v_user and p.status<>'reserved'
 join public.venues v on v.id=m.venue_id join private.meetup_details d on d.meetup_id=m.id
 join private.meetup_responses r on r.meetup_id=m.id and r.user_id=v_user order by m.starts_at desc limit 20) h),'[]'::jsonb)) into v_result;
 return v_result;
end $$;
commit;

-- Private profile settings and real meetup chat. No public member directory.
begin;
create table private.member_settings (
 user_id uuid primary key references public.profiles(id), age integer check(age between 18 and 99),
 interests text[] not null default '{}', prefs jsonb not null default '{"verifiedOnly":false,"share":false,"hideAge":false,"notifyFriends":false,"friendMeetups":false,"friendsFirst":false}',
 approx_lat double precision, approx_lon double precision, trusted_email text,
 check(approx_lat between -90 and 90),check(approx_lon between -180 and 180)
);
create table private.availability_details(user_id uuid primary key references public.profiles(id),note text not null default '' check(length(note)<=60),preferences text[] not null default '{}',radius_km numeric not null default 1 check(radius_km between 0.5 and 3));
create table private.meetup_messages(id bigint generated always as identity primary key,meetup_id uuid not null references public.meetups(id),user_id uuid not null references public.profiles(id),body text not null check(length(body) between 1 and 80),created_at timestamptz not null default now());
create index meetup_messages_recent on private.meetup_messages(meetup_id,id desc);
create index meetup_messages_rate on private.meetup_messages(user_id,created_at desc);
revoke all on private.member_settings,private.availability_details,private.meetup_messages from public,anon,authenticated;
create function public.save_member_settings(p_patch jsonb) returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_key text;
begin
 if not private.is_confirmed() then raise exception 'Confirm your email first'; end if;
 if p_patch is null or jsonb_typeof(p_patch)<>'object' then raise exception 'Invalid settings'; end if;
 for v_key in select jsonb_object_keys(p_patch) loop
  if v_key not in ('age','interests','verifiedOnly','share','hideAge','notifyFriends','friendMeetups','friendsFirst','latitude','longitude','trustedEmail') then raise exception 'Unknown setting'; end if;
  if v_key in ('verifiedOnly','share','hideAge','notifyFriends','friendMeetups','friendsFirst') and jsonb_typeof(p_patch->v_key)<>'boolean' then raise exception 'Invalid preference'; end if;
 end loop;
 insert into private.member_settings(user_id) values(v_user) on conflict do nothing;
 if p_patch ? 'age' then update private.member_settings set age=(p_patch->>'age')::integer where user_id=v_user; end if;
 if p_patch ? 'interests' then
  if jsonb_typeof(p_patch->'interests')<>'array' or jsonb_array_length(p_patch->'interests')>20 or exists(select 1 from jsonb_array_elements(p_patch->'interests') e where jsonb_typeof(e)<>'string' or length(e#>>'{}') not between 1 and 40) then raise exception 'Invalid interests'; end if;
  update private.member_settings set interests=array(select jsonb_array_elements_text(p_patch->'interests')) where user_id=v_user;
 end if;
 if p_patch ? 'latitude' or p_patch ? 'longitude' then
  if not (p_patch ? 'latitude' and p_patch ? 'longitude') then raise exception 'Both coordinates required'; end if;
  update private.member_settings set approx_lat=round((p_patch->>'latitude')::numeric,2),approx_lon=round((p_patch->>'longitude')::numeric,2) where user_id=v_user;
 end if;
 if p_patch ? 'trustedEmail' then
  if length(p_patch->>'trustedEmail')>254 or (p_patch->>'trustedEmail')!~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Enter a valid email'; end if;
  update private.member_settings set trusted_email=p_patch->>'trustedEmail' where user_id=v_user;
 end if;
 if p_patch->>'share'='true' and not exists(select 1 from private.member_settings where user_id=v_user and trusted_email is not null) then raise exception 'Add a trusted contact first'; end if;
 update private.member_settings set prefs=prefs||(p_patch-'age'-'interests'-'latitude'-'longitude'-'trustedEmail') where user_id=v_user;
end $$;
create function public.send_meetup_message(p_text text) returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_id uuid;
begin
 if not private.is_confirmed() then raise exception 'Sign in first'; end if;
 if p_text is null or length(trim(p_text)) not between 1 and 80 then raise exception 'Use 1 to 80 characters'; end if;
 perform pg_advisory_xact_lock(hashtextextended('message:'||v_user::text,0));
 select m.id into v_id from public.meetups m join public.meetup_participants p on p.meetup_id=m.id and p.user_id=v_user and p.status='reserved' where m.status='confirmed' for share of m;
 if v_id is null then raise exception 'Chat is available only during a confirmed meetup'; end if;
 if (select count(*) from private.meetup_messages where user_id=v_user and created_at>now()-interval '1 minute')>=10 then raise exception 'Please wait before sending more messages'; end if;
 insert into private.meetup_messages(meetup_id,user_id,body) values(v_id,v_user,trim(p_text));
end $$;
create function public.publish_availability(p_intent text,p_duration integer,p_window integer,p_radius numeric,p_note text default '',p_preferences text[] default '{}') returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_confirmed() then raise exception 'Sign in first'; end if;
 if p_window not in (30,60,120) or p_window is null or p_radius not in (0.5,1,2,3) or p_radius is null or p_note is null or length(p_note)>60 or p_preferences is null or cardinality(p_preferences)>10 then raise exception 'Invalid availability'; end if;
 if 'Women only'=any(p_preferences) then raise exception 'Women-only matching needs a declared gender; choose another preference for now'; end if;
 insert into private.availability_details(user_id,note,preferences,radius_km) values(auth.uid(),p_note,p_preferences,p_radius) on conflict(user_id) do update set note=excluded.note,preferences=excluded.preferences,radius_km=excluded.radius_km;
 perform public.meetup_command('live',null,p_intent,p_duration);
 update private.match_queue set expires_at=now()+make_interval(mins=>p_window) where user_id=auth.uid();
end $$;
revoke execute on function public.save_member_settings(jsonb),public.send_meetup_message(text),public.publish_availability(text,integer,integer,numeric,text,text[]) from public,anon;
grant execute on function public.save_member_settings(jsonb),public.send_meetup_message(text),public.publish_availability(text,integer,integer,numeric,text,text[]) to authenticated;
create or replace function public.my_live_state() returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_city uuid; v_result jsonb;
begin
 if not private.is_confirmed() then raise exception 'Sign in first'; end if;
 select home_city_id into v_city from public.profiles where id=v_user;
 if v_city is not null then
  perform pg_advisory_xact_lock(hashtextextended('meetup-city:'||v_city::text,0));
  perform private.expire_matches(v_city);
 end if;
 select jsonb_build_object('settings',coalesce((select to_jsonb(s)-'user_id'-'approx_lat'-'approx_lon' from private.member_settings s where s.user_id=v_user),'{}'::jsonb),'blocked_count',(select count(*) from private.member_blocks where blocker_id=v_user),'messages',coalesce((select jsonb_agg(messages) from (select msg.id,msg.body text,case when msg.user_id=v_user then 'me' else 'them' end "from" from private.meetup_messages msg join public.meetups mm on mm.id=msg.meetup_id and mm.status='confirmed' join public.meetup_participants mp on mp.meetup_id=mm.id and mp.user_id=v_user and mp.status='reserved' order by msg.id desc limit 100) messages),'[]'::jsonb),'queue',(select to_jsonb(q)-'user_id' from private.match_queue q where q.user_id=v_user),
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
create or replace function public.save_profile(p_name text, p_adult boolean, p_city uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_city uuid;
begin
  select coalesce(p_city,(select home_city_id from public.profiles where id=auth.uid()),(select id from public.cities where slug='manchester' and status='active')) into v_city;
  if not private.is_confirmed() then raise exception 'Confirmed email required'; end if;
  if length(trim(p_name)) not between 1 and 80 or p_adult is distinct from true then
    raise exception 'Name and adult declaration required';
  end if;
  if v_city is not null and not exists(select 1 from public.cities where id=v_city and status='active') then
    raise exception 'City is not available';
  end if;
  update public.profiles set display_name=trim(p_name),
    adult_declared_at=coalesce(adult_declared_at, now()), home_city_id=v_city, updated_at=now()
    where id=(select auth.uid());
end $$;

create or replace function public.meetup_command(p_command text,p_venue uuid default null,p_intent text default null,p_duration integer default 30,p_rating integer default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_city uuid; v_other uuid; v_meetup public.meetups; v_access private.member_access; v_id uuid; v_duration integer; v_venue uuid; v_intent text;
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
  select q.user_id,least(q.duration_min,p_duration),q.venue_id,q.intent into v_other,v_duration,v_venue,v_intent from private.match_queue q
    join private.member_access a on a.user_id=q.user_id
    where q.city_id=v_city and q.user_id<>v_user and q.expires_at>now()
      and (q.venue_id is null or exists(select 1 from public.venues v where v.id=q.venue_id and v.city_id=v_city and v.status in ('listed','approved')))
      and not exists(select 1 from private.member_blocks b where (b.blocker_id=v_user and b.blocked_id=q.user_id) or (b.blocker_id=q.user_id and b.blocked_id=v_user))
      and a.account_status='active' and a.reserved_meetups=0 and (a.id_status='approved' or (a.id_status<>'revoked' and a.completed_meetups<3))
      and exists(select 1 from auth.users u where u.id=q.user_id and u.email_confirmed_at is not null)
      and (not coalesce((select (prefs->>'verifiedOnly')::boolean from private.member_settings where user_id=v_user),false) or a.id_status='approved')
      and (not coalesce((select (prefs->>'verifiedOnly')::boolean from private.member_settings where user_id=q.user_id),false) or v_access.id_status='approved')
      and not exists(select 1 from private.availability_details ad where ad.user_id in (v_user,q.user_id) and 'Verified ID only'=any(ad.preferences) and (a.id_status<>'approved' or v_access.id_status<>'approved'))
      and not exists(select 1 from private.availability_details ad where ad.user_id in (v_user,q.user_id) and 'Similar age'=any(ad.preferences) and not exists(select 1 from private.member_settings me join private.member_settings them on them.user_id=q.user_id where me.user_id=v_user and abs(me.age-them.age)<=5))
      and not exists(select 1 from private.availability_details ad where ad.user_id in (v_user,q.user_id) and 'Shared interests'=any(ad.preferences) and not exists(select 1 from private.member_settings me join private.member_settings them on them.user_id=q.user_id where me.user_id=v_user and me.interests && them.interests))
    order by q.created_at limit 1 for update of q;
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

alter table private.member_settings enable row level security;
alter table private.availability_details enable row level security;
alter table private.meetup_messages enable row level security;
commit;

begin;
create table private.friend_codes (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 token uuid not null unique default gen_random_uuid(), expires_at timestamptz not null
);
create table private.friend_requests (
 id uuid primary key default gen_random_uuid(), sender_id uuid not null references public.profiles(id) on delete cascade,
 recipient_id uuid not null references public.profiles(id) on delete cascade,
 expires_at timestamptz not null default now()+interval '5 minutes',
 unique(sender_id,recipient_id), check(sender_id<>recipient_id)
);
create table private.friendships (
 first_id uuid not null references public.profiles(id) on delete cascade,
 second_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(first_id,second_id), check(first_id<second_id)
);
alter table private.friend_codes enable row level security;
alter table private.friend_requests enable row level security;
alter table private.friendships enable row level security;
revoke all on private.friend_codes,private.friend_requests,private.friendships from public,anon,authenticated;
grant all on private.friend_codes,private.friend_requests,private.friendships to service_role;

create function private.friend_visible(p_other uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.is_confirmed() and exists(select 1 from private.member_access where user_id=p_other and account_status='active')
 and not exists(select 1 from private.member_blocks where
 (blocker_id=auth.uid() and blocked_id=p_other) or (blocked_id=auth.uid() and blocker_id=p_other))
 and (exists(select 1 from private.friendships where first_id=least(auth.uid(),p_other) and second_id=greatest(auth.uid(),p_other))
 or exists(select 1 from private.friend_requests where expires_at>now() and
 ((sender_id=auth.uid() and recipient_id=p_other) or (recipient_id=auth.uid() and sender_id=p_other))));
$$;
revoke all on function private.friend_visible(uuid) from public,anon,authenticated;
grant execute on function private.friend_visible(uuid) to authenticated;
create policy friend_profile_photo on storage.objects for select to authenticated
using(bucket_id='profile-photos' and exists(select 1 from public.profiles p where p.photo_path=name and private.friend_visible(p.id)));
-- This narrow policy shares current photos, without exposing profile rows to clients.
create policy friend_profile_read on public.profiles for select to authenticated using(private.friend_visible(id));

create function public.friend_command(p_command text default 'state',p_value uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); other_id uuid; request private.friend_requests; result jsonb;
begin
 if not private.is_confirmed() or not exists(select 1 from public.profiles where id=me and onboarding_completed_at is not null) then
 raise exception 'Complete your confirmed account first'; end if;
 perform pg_advisory_xact_lock(hashtextextended(me::text,7));
 if p_command='code' then
 insert into private.friend_codes(user_id,expires_at) values(me,now()+interval '60 seconds')
 on conflict(user_id) do update set token=gen_random_uuid(),expires_at=excluded.expires_at
 where private.friend_codes.expires_at<=now();
 elsif p_command='scan' then
 select user_id into other_id from private.friend_codes where token=p_value and expires_at>now();
 if other_id is null then raise exception 'Code expired or invalid. Ask them to refresh it.'; end if;
 if other_id=me then raise exception 'This is your own code'; end if;
 if not exists(select 1 from private.member_access a join public.profiles p on p.id=a.user_id
 where a.user_id=other_id and a.account_status='active' and p.onboarding_completed_at is not null)
 or exists(select 1 from private.member_blocks where (blocker_id=me and blocked_id=other_id) or (blocker_id=other_id and blocked_id=me)) then
 raise exception 'This member is unavailable'; end if;
 if (select count(*) from private.friend_requests where sender_id=me and expires_at>now())>=10 then raise exception 'Too many scans. Try again in a few minutes.'; end if;
 insert into private.friend_requests(sender_id,recipient_id) values(me,other_id)
 on conflict(sender_id,recipient_id) do update set id=gen_random_uuid(),expires_at=now()+interval '5 minutes'
 returning * into request;
 elsif p_command='confirm' then
 select * into request from private.friend_requests where id=p_value and recipient_id=me and expires_at>now() for update;
 if not found then raise exception 'Request expired. Scan again.'; end if;
 other_id:=request.sender_id;
 if not private.friend_visible(other_id) then raise exception 'This member is unavailable'; end if;
 insert into private.friendships(first_id,second_id) values(least(me,other_id),greatest(me,other_id)) on conflict do nothing;
 delete from private.friend_requests where (sender_id=me and recipient_id=other_id) or (sender_id=other_id and recipient_id=me);
 elsif p_command='remove' then
 delete from private.friendships where first_id=least(me,p_value) and second_id=greatest(me,p_value);
 delete from private.friend_requests where (sender_id=me and recipient_id=p_value) or (sender_id=p_value and recipient_id=me);
 elsif p_command<>'state' then raise exception 'Invalid friend action'; end if;
 select jsonb_build_object(
 'code',(select jsonb_build_object('token',token,'expires_at',expires_at) from private.friend_codes where user_id=me and expires_at>now()),
 'scanned_id',other_id,'request_id',request.id,
 'friends',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'photo_path',p.photo_path,'since',f.created_at))
 from private.friendships f join public.profiles p on p.id=case when f.first_id=me then f.second_id else f.first_id end
 where me in(f.first_id,f.second_id) and private.friend_visible(p.id)),'[]'::jsonb),
 'requests',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'incoming',r.recipient_id=me,'person_id',p.id,'name',p.display_name,'photo_path',p.photo_path))
 from private.friend_requests r join public.profiles p on p.id=case when r.sender_id=me then r.recipient_id else r.sender_id end
 where me in(r.sender_id,r.recipient_id) and r.expires_at>now() and private.friend_visible(p.id)),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.friend_command(text,uuid) from public,anon,authenticated;
grant execute on function public.friend_command(text,uuid) to authenticated;
commit;

-- Matching alerts and opt-in trusted-contact emails use the existing durable outbox.
begin;
alter table private.notification_jobs drop constraint notification_jobs_kind_check;
alter table private.notification_jobs add constraint notification_jobs_kind_check check(kind in ('welcome_email','welcome_push','meetup_push','trusted_email','friend_push'));
alter table private.notification_jobs add column payload jsonb not null default '{}';
create or replace function public.begin_notification_delivery(p_id uuid,p_lease uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare first_attempt timestamptz; job_kind text;
begin
 select provider_attempted_at,kind into first_attempt,job_kind from private.notification_jobs where id=p_id and lease_token=p_lease and state='processing' for update;
 if not found then return false; end if;
 if first_attempt is not null and first_attempt<now()-(case when job_kind like '%email' then interval '23 hours' else interval '29 days' end) then return false; end if;
 update private.notification_jobs set provider_attempted_at=coalesce(provider_attempted_at,now()) where id=p_id;
 return true;
end $$;
create function private.queue_meetup_offer() returns trigger language plpgsql security definer set search_path='' as $$
declare m public.meetups; v_recipient uuid; v_expiry timestamptz;
begin
 select * into m from public.meetups where id=new.meetup_id;
 if m.status<>'draft' or new.user_id<>m.host_id then return new; end if;
 select proposal_expires_at into v_expiry from private.meetup_details where meetup_id=m.id;
 if tg_op='INSERT' then v_recipient:=m.host_id;
 elsif old.accepted_at is null and new.accepted_at is not null then select user_id into v_recipient from private.meetup_responses where meetup_id=m.id and user_id<>m.host_id;
 else return new; end if;
 insert into private.notification_jobs(user_id,event_key,kind,payload) values(v_recipient,'offer:'||m.id||':'||v_recipient,'meetup_push',jsonb_build_object('title','A new UpCatch','text','You have a meetup offer. Open UpCatch to accept or pass.','expires_at',v_expiry)) on conflict do nothing;
 return new;
end $$;
create trigger queue_meetup_offer after insert or update of accepted_at on private.meetup_responses for each row execute function private.queue_meetup_offer();
create function private.queue_meetup_status() returns trigger language plpgsql security definer set search_path='' as $$
declare v_user uuid; s private.member_settings; v_venue text; v_other text;
begin
 if new.status=old.status or new.status not in ('confirmed','cancelled','completed') then return new; end if;
 for v_user in select user_id from public.meetup_participants where meetup_id=new.id loop
  insert into private.notification_jobs(user_id,event_key,kind,payload) values(v_user,'status:'||new.id||':'||new.status||':'||v_user,'meetup_push',jsonb_build_object('title','UpCatch '||new.status,'text',case new.status when 'confirmed' then 'Both people accepted. Your meetup is confirmed.' when 'completed' then 'Your meetup is complete. Leave your rating in UpCatch.' else 'Your meetup was cancelled. Open UpCatch for details.' end)) on conflict do nothing;
  select * into s from private.member_settings where user_id=v_user;
  if new.status='confirmed' and s.trusted_email is not null and coalesce((s.prefs->>'share')::boolean,false) then
   select name||', '||address into v_venue from public.venues where id=new.venue_id;
   select display_name into v_other from public.profiles where id=(select user_id from public.meetup_participants where meetup_id=new.id and user_id<>v_user);
   insert into private.notification_jobs(user_id,event_key,kind,payload) values(v_user,'trusted:'||new.id||':'||v_user,'trusted_email',jsonb_build_object('to',s.trusted_email,'title','UpCatch meetup details','text','Your contact has agreed to meet '||v_other||' at '||v_venue||'. Scheduled start: '||new.starts_at::text)) on conflict do nothing;
  end if;
 end loop;
 return new;
end $$;
create trigger queue_meetup_status after update of status on public.meetups for each row execute function private.queue_meetup_status();
revoke execute on function private.queue_meetup_offer(),private.queue_meetup_status() from public,anon,authenticated;
commit;

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

-- Audience is mutual: friends, public (new people), or both.
begin;
alter table private.member_settings add column audience text not null default 'both' check(audience in ('friends','public','both'));
alter table private.match_queue add column audience text not null default 'both' check(audience in ('friends','public','both'));
create function public.set_matching_audience(p_audience text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_confirmed() then raise exception 'Sign in first'; end if;
 if p_audience is null or p_audience not in ('friends','public','both') then raise exception 'Choose your audience'; end if;
 insert into private.member_settings(user_id,audience) values(auth.uid(),p_audience) on conflict(user_id) do update set audience=excluded.audience;
 update private.match_queue set audience=p_audience where user_id=auth.uid();
end $$;
create function private.queue_audience() returns trigger language plpgsql security definer set search_path='' as $$
begin
 new.audience:=coalesce((select audience from private.member_settings where user_id=new.user_id),'both');return new;
end $$;
create trigger matching_audience before insert on private.match_queue for each row execute function private.queue_audience();
revoke execute on function public.set_matching_audience(text),private.queue_audience() from public,anon,authenticated;
grant execute on function public.set_matching_audience(text) to authenticated;
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
      and (case coalesce((select audience from private.member_settings where user_id=v_user),'both') when 'both' then true when 'friends' then exists(select 1 from private.friendships where first_id=least(v_user,q.user_id) and second_id=greatest(v_user,q.user_id)) else not exists(select 1 from private.friendships where first_id=least(v_user,q.user_id) and second_id=greatest(v_user,q.user_id)) end)
      and (case q.audience when 'both' then true when 'friends' then exists(select 1 from private.friendships where first_id=least(v_user,q.user_id) and second_id=greatest(v_user,q.user_id)) else not exists(select 1 from private.friendships where first_id=least(v_user,q.user_id) and second_id=greatest(v_user,q.user_id)) end)
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

commit;

-- Honour the existing radius controls and derive badges from real lifetime history.
begin;
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

create or replace function public.my_live_state() returns jsonb language plpgsql security definer set search_path='' as $$
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
 'meetup',(select jsonb_build_object('id',m.id,'status',m.status,'starts_at',m.starts_at,'ends_at',m.ends_at,
 'intent',d.intent,'proposal_expires_at',d.proposal_expires_at,'venue',jsonb_build_object('name',v.name,'address',v.address),
 'note',coalesce((select note from private.availability_details where user_id=op.id),''),'other_name',op.display_name,'other_id',op.id,'other_age',(select case when (s.prefs->>'hideAge')::boolean then null else s.age end from private.member_settings s where s.user_id=op.id),'other_interests',coalesce((select to_jsonb(s.interests) from private.member_settings s where s.user_id=op.id),'[]'::jsonb),'other_verified',(select id_status='approved' from private.member_access where user_id=op.id),'accepted',r.accepted_at is not null,'arrived',r.arrived_at is not null,'finished',r.finished_at is not null,
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
commit;

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

-- Manual and automatic initiation share one meetup model and lifecycle.
begin;
alter table public.meetups add column creation_type text not null default 'auto' check(creation_type in ('manual','auto'));
alter table private.availability_details add column creation_type text not null default 'manual' check(creation_type in ('manual','auto'));
alter table private.match_queue add column creation_type text not null default 'auto' check(creation_type in ('manual','auto'));
create function private.set_meetup_origin() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.availability_details ad where ad.creation_type='manual' and (ad.user_id=new.host_id or ad.user_id=auth.uid())) then new.creation_type:='manual'; end if;
 return new;
end $$;
create trigger meetup_origin before insert on public.meetups for each row execute function private.set_meetup_origin();
create function private.set_queue_origin() returns trigger language plpgsql security definer set search_path='' as $$
begin
 new.creation_type:=coalesce((select creation_type from private.availability_details where user_id=new.user_id),'auto');return new;
end $$;
create trigger queue_origin before insert on private.match_queue for each row execute function private.set_queue_origin();
create function public.go_online(p_intent text,p_duration integer) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_confirmed() then raise exception 'Sign in first'; end if;
 insert into private.availability_details(user_id,note,preferences,radius_km,creation_type) values(auth.uid(),'','{}',3,'auto') on conflict(user_id) do update set note='',preferences='{}',radius_km=3,creation_type='auto';
 perform public.meetup_command('live',null,p_intent,p_duration);
end $$;
revoke execute on function private.set_meetup_origin(),private.set_queue_origin(),public.go_online(text,integer) from public,anon,authenticated;
grant execute on function public.go_online(text,integer) to authenticated;
create or replace function public.publish_availability(p_intent text,p_duration integer,p_window integer,p_radius numeric,p_note text default '',p_preferences text[] default '{}') returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_confirmed() then raise exception 'Sign in first'; end if;
 if p_window not in (30,60,120) or p_window is null or p_radius not in (0.5,1,2,3) or p_radius is null or p_note is null or length(p_note)>60 or p_preferences is null or cardinality(p_preferences)>10 then raise exception 'Invalid availability'; end if;
 if 'Women only'=any(p_preferences) then raise exception 'Women-only matching needs a declared gender; choose another preference for now'; end if;
 insert into private.availability_details(user_id,note,preferences,radius_km) values(auth.uid(),p_note,p_preferences,p_radius) on conflict(user_id) do update set note=excluded.note,preferences=excluded.preferences,radius_km=excluded.radius_km;
 update private.availability_details set creation_type='manual' where user_id=auth.uid();
 perform public.meetup_command('live',null,p_intent,p_duration);
 update private.match_queue set expires_at=now()+make_interval(mins=>p_window) where user_id=auth.uid();
end $$;
create or replace function public.my_live_state() returns jsonb language plpgsql security definer set search_path='' as $$
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
 'intent',d.intent,'proposal_expires_at',d.proposal_expires_at,'venue',jsonb_build_object('name',v.name,'address',v.address),
 'note',coalesce((select note from private.availability_details where user_id=op.id),''),'other_name',op.display_name,'other_id',op.id,'other_age',(select case when (s.prefs->>'hideAge')::boolean then null else s.age end from private.member_settings s where s.user_id=op.id),'other_interests',coalesce((select to_jsonb(s.interests) from private.member_settings s where s.user_id=op.id),'[]'::jsonb),'other_verified',(select id_status='approved' from private.member_access where user_id=op.id),'accepted',r.accepted_at is not null,'arrived',r.arrived_at is not null,'finished',r.finished_at is not null,
 'other_accepted',orr.accepted_at is not null,'other_arrived',orr.arrived_at is not null,'other_finished',orr.finished_at is not null)
 from public.meetups m join public.meetup_participants p on p.meetup_id=m.id and p.user_id=v_user and p.status='reserved'
 join private.meetup_details d on d.meetup_id=m.id join public.venues v on v.id=m.venue_id
 join private.meetup_responses r on r.meetup_id=m.id and r.user_id=v_user
 join private.meetup_responses orr on orr.meetup_id=m.id and orr.user_id<>v_user
 join public.profiles op on op.id=orr.user_id
 where m.status<>'draft' or m.host_id=v_user or exists(select 1 from private.meetup_responses first_response where first_response.meetup_id=m.id and first_response.user_id=m.host_id and first_response.accepted_at is not null)),
 'history',coalesce((select jsonb_agg(h) from (select m.id,m.status,m.creation_type,m.starts_at,m.ends_at,v.name venue,d.intent,r.rating,(select display_name from public.profiles op join private.meetup_responses orr on orr.user_id=op.id where orr.meetup_id=m.id and orr.user_id<>v_user) other_name
 from public.meetups m join public.meetup_participants p on p.meetup_id=m.id and p.user_id=v_user and p.status<>'reserved'
 join public.venues v on v.id=m.venue_id join private.meetup_details d on d.meetup_id=m.id
 join private.meetup_responses r on r.meetup_id=m.id and r.user_id=v_user order by m.starts_at desc limit 20) h),'[]'::jsonb)) into v_result;
 return v_result;
end $$;
commit;

-- Only the matched peer's rounded area is shared; exact device GPS is never stored.
begin;
alter table private.member_settings add column location_updated_at timestamptz;
create function public.my_partner_location() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.is_confirmed() then raise exception 'Sign in first'; end if;
 return (select jsonb_build_object('meetup_id',m.id,'latitude',s.approx_lat,'longitude',s.approx_lon,'updated_at',s.location_updated_at)
 from public.meetups m join public.meetup_participants own on own.meetup_id=m.id and own.user_id=auth.uid() and own.status='reserved'
 join private.meetup_responses peer on peer.meetup_id=m.id and peer.user_id<>auth.uid()
 join private.meetup_responses first_response on first_response.meetup_id=m.id and first_response.user_id=m.host_id
 join private.meetup_details d on d.meetup_id=m.id
 join private.member_settings s on s.user_id=peer.user_id
 join private.member_access access on access.user_id=peer.user_id and access.account_status='active'
 where m.status in ('draft','confirmed') and (m.status='confirmed' or d.proposal_expires_at>now())
 and (m.status='confirmed' or m.host_id=auth.uid() or first_response.accepted_at is not null)
 and s.approx_lat is not null and s.approx_lon is not null
 and not exists(select 1 from private.member_blocks b where (b.blocker_id=auth.uid() and b.blocked_id=peer.user_id) or (b.blocker_id=peer.user_id and b.blocked_id=auth.uid())));
end $$;
revoke execute on function public.my_partner_location() from public,anon;
grant execute on function public.my_partner_location() to authenticated;
create or replace function public.save_member_settings(p_patch jsonb) returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_key text;
begin
 if not private.is_confirmed() then raise exception 'Confirm your email first'; end if;
 if p_patch is null or jsonb_typeof(p_patch)<>'object' then raise exception 'Invalid settings'; end if;
 for v_key in select jsonb_object_keys(p_patch) loop
  if v_key not in ('age','interests','verifiedOnly','share','hideAge','notifyFriends','friendMeetups','friendsFirst','latitude','longitude','trustedEmail') then raise exception 'Unknown setting'; end if;
  if v_key in ('verifiedOnly','share','hideAge','notifyFriends','friendMeetups','friendsFirst') and jsonb_typeof(p_patch->v_key)<>'boolean' then raise exception 'Invalid preference'; end if;
 end loop;
 insert into private.member_settings(user_id) values(v_user) on conflict do nothing;
 if p_patch ? 'age' then update private.member_settings set age=(p_patch->>'age')::integer where user_id=v_user; end if;
 if p_patch ? 'interests' then
  if jsonb_typeof(p_patch->'interests')<>'array' or jsonb_array_length(p_patch->'interests')>20 or exists(select 1 from jsonb_array_elements(p_patch->'interests') e where jsonb_typeof(e)<>'string' or length(e#>>'{}') not between 1 and 40) then raise exception 'Invalid interests'; end if;
  update private.member_settings set interests=array(select jsonb_array_elements_text(p_patch->'interests')) where user_id=v_user;
 end if;
 if p_patch ? 'latitude' or p_patch ? 'longitude' then
  if not (p_patch ? 'latitude' and p_patch ? 'longitude') then raise exception 'Both coordinates required'; end if;
  update private.member_settings set location_updated_at=now(),approx_lat=round((p_patch->>'latitude')::numeric,2),approx_lon=round((p_patch->>'longitude')::numeric,2) where user_id=v_user;
 end if;
 if p_patch ? 'trustedEmail' then
  if length(p_patch->>'trustedEmail')>254 or (p_patch->>'trustedEmail')!~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Enter a valid email'; end if;
  update private.member_settings set trusted_email=p_patch->>'trustedEmail' where user_id=v_user;
 end if;
 if p_patch->>'share'='true' and not exists(select 1 from private.member_settings where user_id=v_user and trusted_email is not null) then raise exception 'Add a trusted contact first'; end if;
 update private.member_settings set prefs=prefs||(p_patch-'age'-'interests'-'latitude'-'longitude'-'trustedEmail') where user_id=v_user;
end $$;
commit;

-- QR friendships are global and do not require a meetup, arrival, location or city match.
begin;
drop policy if exists friend_profile_read on public.profiles;
drop policy if exists friend_profile_photo on storage.objects;

create function private.qr_friend_peer(p_other uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.is_confirmed() and p_other<>auth.uid()
 and exists(select 1 from public.profiles p join private.member_access a on a.user_id=p.id
 join auth.users u on u.id=p.id where p.id=p_other and p.onboarding_completed_at is not null
 and a.account_status='active' and u.email_confirmed_at is not null)
 and not exists(select 1 from private.member_blocks where
 (blocker_id=auth.uid() and blocked_id=p_other) or (blocked_id=auth.uid() and blocker_id=p_other));
$$;
revoke all on function private.qr_friend_peer(uuid) from public,anon,authenticated;

create function public.qr_friend_photo_path(p_user uuid,p_token uuid default null) returns text
language plpgsql security definer set search_path='' as $$
begin
 if not private.qr_friend_peer(p_user) or not exists(select 1 from public.profiles where id=auth.uid() and onboarding_completed_at is not null) then return null; end if;
 if not private.friend_visible(p_user) and not exists(select 1 from private.friend_codes where user_id=p_user and token=p_token and expires_at>now()) then return null; end if;
 return (select photo_path from public.profiles where id=p_user);
end $$;
revoke all on function public.qr_friend_photo_path(uuid,uuid) from public,anon,authenticated;
grant execute on function public.qr_friend_photo_path(uuid,uuid) to authenticated;

create or replace function public.friend_command(p_command text default 'state',p_value uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); other_id uuid; req private.friend_requests; result jsonb;
begin
 if not private.is_confirmed() or not exists(select 1 from public.profiles where id=me and onboarding_completed_at is not null) then
 raise exception 'Complete your confirmed account first'; end if;
 perform pg_advisory_xact_lock(hashtextextended(me::text,7));
 delete from private.friend_requests where me in(sender_id,recipient_id) and expires_at<=now();
 if p_command='code' then
 insert into private.friend_codes(user_id,expires_at) values(me,now()+interval '60 seconds')
 on conflict(user_id) do update set token=gen_random_uuid(),expires_at=excluded.expires_at
 where private.friend_codes.expires_at<=now();
 elsif p_command in('resolve','scan') then
 select user_id into other_id from private.friend_codes where token=p_value and expires_at>now();
 if other_id is null then raise exception 'Code expired or invalid. Ask them to refresh it.'; end if;
 if other_id=me then raise exception 'This is your own code'; end if;
 if not private.qr_friend_peer(other_id) then raise exception 'This member is unavailable'; end if;
 if p_command='scan' and not exists(select 1 from private.friendships where first_id=least(me,other_id) and second_id=greatest(me,other_id)) then
  if (select count(*) from private.friend_requests where sender_id=me and expires_at>now())>=10
   and not exists(select 1 from private.friend_requests where sender_id=me and recipient_id=other_id) then raise exception 'Too many scans. Try again in a few minutes.'; end if;
  insert into private.friend_requests(sender_id,recipient_id) values(me,other_id)
  on conflict(sender_id,recipient_id) do update set expires_at=private.friend_requests.expires_at
  returning * into req;
 end if;
 elsif p_command='confirm' then
 select * into req from private.friend_requests where id=p_value and recipient_id=me and expires_at>now() for update;
 if not found then raise exception 'Request expired. Scan again.'; end if;
 other_id:=req.sender_id;
 if not private.qr_friend_peer(other_id) then raise exception 'This member is unavailable'; end if;
 insert into private.friendships(first_id,second_id) values(least(me,other_id),greatest(me,other_id)) on conflict do nothing;
 delete from private.friend_requests where (sender_id=me and recipient_id=other_id) or (sender_id=other_id and recipient_id=me);
 elsif p_command='dismiss' then
 delete from private.friend_requests where id=p_value and me in(sender_id,recipient_id);
 elsif p_command='remove' then
 delete from private.friendships where first_id=least(me,p_value) and second_id=greatest(me,p_value);
 delete from private.friend_requests where (sender_id=me and recipient_id=p_value) or (sender_id=p_value and recipient_id=me);
 elsif p_command<>'state' then raise exception 'Invalid friend action'; end if;
 select jsonb_build_object(
 'code',(select jsonb_build_object('token',token,'expires_at',expires_at) from private.friend_codes where user_id=me and expires_at>now()),
 'scanned_id',other_id,'request_id',req.id,
 'person',(select jsonb_build_object('id',id,'name',display_name,'photo_path',photo_path) from public.profiles where id=other_id),
 'friends',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'photo_path',p.photo_path,'since',f.created_at))
 from private.friendships f join public.profiles p on p.id=case when f.first_id=me then f.second_id else f.first_id end
 where me in(f.first_id,f.second_id) and private.qr_friend_peer(p.id)),'[]'::jsonb),
 'requests',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'incoming',r.recipient_id=me,'person_id',p.id,'name',p.display_name,'photo_path',p.photo_path) order by r.expires_at)
 from private.friend_requests r join public.profiles p on p.id=case when r.sender_id=me then r.recipient_id else r.sender_id end
 where me in(r.sender_id,r.recipient_id) and r.expires_at>now() and private.qr_friend_peer(p.id)),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.friend_command(text,uuid) from public,anon,authenticated;
grant execute on function public.friend_command(text,uuid) to authenticated;
commit;

-- Manchester MVP catalogue. Researched 2026-09-26; see docs/manchester-venues.md.
-- Idempotent: rerunning never overwrites operator edits or review decisions.
begin;
insert into public.cities(country_code,slug,name,region_name,timezone,status,latitude,longitude)
values('GB','manchester','Manchester','Greater Manchester','Europe/London','active',53.4808,-2.2426)
on conflict(country_code,slug) do nothing;
insert into public.neighbourhoods(city_id,slug,name)
select c.id,n.slug,n.name from public.cities c cross join (values
('spinningfields','Spinningfields'),('deansgate','Deansgate'),('central','City Centre'),
('oxford-road','Oxford Road'),('ancoats','Ancoats'),('piccadilly','Piccadilly'),
('corn-exchange','Corn Exchange')) as n(slug,name)
where c.country_code='GB' and c.slug='manchester'
on conflict(city_id,slug) do nothing;
insert into public.venues(city_id,neighbourhood_id,slug,name,address,cuisine,website_url,source_url,source_checked_at,status)
select c.id,n.id,v.slug,v.name,v.address,v.cuisine,v.website,v.website,date '2026-09-26','listed'
from public.cities c
cross join (values
('dishoom-manchester','Dishoom Manchester','32 Bridge Street, Manchester, M3 3BT','Indian','spinningfields','https://www.dishoom.com/manchester/'),
('hawksmoor-manchester','Hawksmoor Manchester','184–186 Deansgate, Manchester, M3 3WB','Steak and seafood','deansgate','https://thehawksmoor.com/locations/manchester/'),
('the-ivy-spinningfields','The Ivy Spinningfields','The Pavilion, Byrom Street, Manchester, M3 3HG','British','spinningfields','https://ivycollection.com/restaurants-near-me/the-ivy-north-west/the-ivy-manchester/'),
('20-stories','20 Stories','No 1 Spinningfields, 1 Hardman Square, Manchester, M3 3EB','Modern British','spinningfields','https://20stories.co.uk/contact-us/'),
('el-gato-negro','El Gato Negro','52 King Street, Manchester, M2 4LY','Spanish tapas','central','https://www.elgatonegrotapas.com/manchester/'),
('san-carlo-manchester','San Carlo Manchester','40–42 King Street West, Manchester, M3 2WY','Italian','deansgate','https://sancarlo.co.uk/restaurants/manchester/san-carlo-manchester/'),
('the-refuge','The Refuge','Oxford Street, Manchester, M60 7HA','International','oxford-road','https://www.refugemcr.co.uk/'),
('the-french','The French','The Midland, 16 Peter Street, Manchester, M60 2DS','Modern British','central','https://www.themidlandhotel.co.uk/contact'),
('mana','mana','42 Blossom Street, Ancoats, Manchester, M4 6BF','Modern British','ancoats','https://manarestaurant.co.uk/pages/contact'),
('rudys-ancoats','Rudy’s Pizza Napoletana — Ancoats','9 Cotton Street, Ancoats, Manchester, M4 5BF','Neapolitan pizza','ancoats','https://www.rudyspizza.co.uk/location/ancoats/'),
('bundobust-piccadilly','Bundobust Manchester Piccadilly','61 Piccadilly, Manchester, M1 2AG','Indian vegetarian','piccadilly','https://bundobust.com/locations/manchester/'),
('mowgli-corn-exchange','Mowgli Manchester','Corn Exchange, Exchange Square, Manchester, M4 3TR','Indian street food','corn-exchange','https://mowglistreetfood.com/restaurants/manchester/'),
('fogo-de-chao-manchester','Fogo de Chão Manchester (formerly Fazenda)','The Avenue, Spinningfields, Manchester, M3 3AP','Brazilian steakhouse','spinningfields','https://fogodechao.uk/location/manchester/'),
('six-by-nico-deansgate','Six by Nico Manchester Deansgate','2 John Dalton Street, Manchester, M3 2BY','Tasting menus','deansgate','https://www.sixbynico.co.uk/manchester/'),
('blacklock-manchester','Blacklock Manchester','37 Peter Street, Manchester, M2 5GB','Steak and chops','central','https://theblacklock.com/restaurants/manchester/'),
('tattu-manchester','Tattu Manchester','3 Hardman Square, Gartside Street, Manchester, M3 3EB','Contemporary Chinese','spinningfields','https://tattu.co.uk/contact/'),
('gaucho-manchester','Gaucho Manchester','2a St Mary’s Street, Manchester, M3 2LB','Argentinian steakhouse','deansgate','https://gauchorestaurants.com/manchester-relaunch/'),
('sexy-fish-manchester','Sexy Fish Manchester','1 The Avenue, Spinningfields, Manchester, M3 3AP','Asian seafood','spinningfields','https://sexyfishmanchester.com/contact-us/'),
('canto','Canto','Cutting Room Square, Blossom Street, Ancoats, Manchester, M4 5DH','Mediterranean tapas','ancoats','https://www.cantorestaurant.com/book/'),
('honest-burgers-manchester','Honest Burgers Manchester','36 Bridge Street, Manchester, M3 3BT','Burgers','spinningfields','https://www.honestburgers.co.uk/locations/manchester/')
) as v(slug,name,address,cuisine,neighbourhood,website)
join public.neighbourhoods n on n.city_id=c.id and n.slug=v.neighbourhood
where c.country_code='GB' and c.slug='manchester'
on conflict(city_id,slug) do nothing;
commit;
