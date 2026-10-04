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
