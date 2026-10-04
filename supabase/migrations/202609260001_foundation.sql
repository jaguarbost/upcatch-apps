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
