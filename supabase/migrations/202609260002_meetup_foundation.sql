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
