begin;
create table private.admin_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table private.admin_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  user_id uuid not null,
  before_value jsonb not null,
  after_value jsonb not null,
  reason text not null check(length(trim(reason)) between 3 and 500),
  created_at timestamptz not null default now()
);
alter table private.admin_members enable row level security;
alter table private.admin_audit enable row level security;
revoke all on private.admin_members,private.admin_audit from public,anon,authenticated;
grant select,insert,delete on private.admin_members to service_role;
grant select on private.admin_audit to service_role;

-- Commercial allowance is independent of the mandatory ID check and completion ledger.
-- NULL retains existing unlimited commercial access; the ID gate still applies after three.
alter table private.member_access
  add column meetup_limit integer check(meetup_limit is null or meetup_limit>=0),
  add column subscription_status text not null default 'free'
    check(subscription_status in ('free','active','paused','cancelled')),
  add column entitlement_version integer not null default 0;

create function private.require_admin() returns void
language plpgsql stable security definer set search_path='' as $$
begin
  if not exists(select 1 from private.admin_members a join auth.users u on u.id=a.user_id
    join private.member_access m on m.user_id=u.id
    where a.user_id=auth.uid() and u.email_confirmed_at is not null and m.account_status='active' and private.is_confirmed())
  then raise exception 'Admin access required' using errcode='42501'; end if;
end $$;
revoke all on function private.require_admin() from public,anon,authenticated;

create function private.guard_commercial_allowance() returns trigger
language plpgsql security definer set search_path='' as $$
declare a private.member_access;
begin
  select * into a from private.member_access where user_id=new.user_id for update;
  if a.meetup_limit is not null and a.completed_meetups+a.reserved_meetups>=a.meetup_limit
  then raise exception 'Meetup allowance exhausted'; end if;
  return new;
end $$;
-- Alphabetic trigger order: check the cap before participation_allowance increments the reservation.
create trigger commercial_participant before insert on public.meetup_participants
for each row execute function private.guard_commercial_allowance();
create trigger commercial_queue before insert or update on private.match_queue
for each row execute function private.guard_commercial_allowance();
revoke all on function private.guard_commercial_allowance() from public,anon,authenticated;

create function public.admin_update_entitlement(
  p_user uuid,p_remaining integer,p_subscription text,p_version integer,p_reason text
) returns void language plpgsql security definer set search_path='' as $$
declare a private.member_access; old_value jsonb; new_value jsonb;
begin
  perform private.require_admin();
  if p_remaining is not null and (p_remaining<0 or p_remaining>100000) then raise exception 'Invalid allowance'; end if;
  if p_subscription is null or p_subscription not in ('free','active','paused','cancelled') then raise exception 'Invalid subscription'; end if;
  if p_reason is null or length(trim(p_reason)) not between 3 and 500 then raise exception 'A reason is required'; end if;
  select * into a from private.member_access where user_id=p_user for update;
  if not found then raise exception 'Member not found'; end if;
  if p_version is null or a.entitlement_version<>p_version then raise exception 'Member changed; refresh and try again'; end if;
  old_value:=jsonb_build_object('meetup_limit',a.meetup_limit,'subscription_status',a.subscription_status,'version',a.entitlement_version);
  update private.member_access set
    meetup_limit=case when p_remaining is null then null else completed_meetups+reserved_meetups+p_remaining end,
    subscription_status=p_subscription,entitlement_version=entitlement_version+1 where user_id=p_user
    returning jsonb_build_object('meetup_limit',meetup_limit,'subscription_status',subscription_status,'version',entitlement_version) into new_value;
  insert into private.admin_audit(actor_id,user_id,before_value,after_value,reason)
    values(auth.uid(),p_user,old_value,new_value,trim(p_reason));
  -- Stop an exhausted waiting member from blocking the FIFO queue. Existing reservations can finish.
  if p_remaining=0 then
    perform private.record_presence(p_user,city_id,'offline','cancelled') from private.match_queue where user_id=p_user;
    delete from private.match_queue where user_id=p_user;
  end if;
end $$;

create function public.admin_dashboard(p_search text default '',p_page integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; v_search text:=trim(coalesce(p_search,''));
begin
  perform private.require_admin();
  if p_page is null or p_page<0 or p_page>100000 or length(v_search)>100 then raise exception 'Invalid search'; end if;
  select jsonb_build_object(
    'stats',jsonb_build_object(
      'members',(select count(*) from public.profiles),
      'online',(select count(distinct user_id) from (
        select user_id from private.match_queue where expires_at>now()
        union select mp.user_id from public.meetup_participants mp join public.meetups m on m.id=mp.meetup_id where mp.status='reserved' and (m.status='confirmed' and m.ends_at>now() or m.status='draft' and exists(select 1 from private.meetup_details d where d.meetup_id=m.id and d.proposal_expires_at>now()))
      ) live),
      'meetups',(select count(*) from public.meetups),
      'completed',(select count(*) from public.meetups where status='completed'),
      'active_subscriptions',(select count(*) from private.member_access where subscription_status='active'),
      'pending_emails',(select count(*) from private.notification_jobs where kind like '%email' and state in ('pending','processing')),
      'failed_emails',(select count(*) from private.notification_jobs where kind like '%email' and state='failed')
    ),
    'members',coalesce((select jsonb_agg(to_jsonb(member)) from (
      select p.id,p.display_name,u.email,c.name city,a.completed_meetups,a.reserved_meetups,a.id_status,
        case when a.meetup_limit is null then null else greatest(0,a.meetup_limit-a.completed_meetups-a.reserved_meetups) end remaining,
        a.subscription_status,a.entitlement_version
      from public.profiles p join auth.users u on u.id=p.id join private.member_access a on a.user_id=p.id
      left join public.cities c on c.id=p.home_city_id
      where v_search='' or position(lower(v_search) in lower(p.display_name||' '||coalesce(u.email,'')))>0 or p.id::text=v_search
      order by p.created_at desc,p.id limit 25 offset p_page*25
    ) member),'[]'::jsonb),
    'member_count',(select count(*) from public.profiles p join auth.users u on u.id=p.id
      where v_search='' or position(lower(v_search) in lower(p.display_name||' '||coalesce(u.email,'')))>0 or p.id::text=v_search),
    'meetups',coalesce((select jsonb_agg(to_jsonb(meetup)) from (
      select m.id,m.status,m.creation_type,m.starts_at,m.ends_at,c.name city,v.name venue,
        (select string_agg(p.display_name,', ' order by p.display_name) from public.meetup_participants mp join public.profiles p on p.id=mp.user_id where mp.meetup_id=m.id) members
      from public.meetups m join public.cities c on c.id=m.city_id left join public.venues v on v.id=m.venue_id
      order by m.created_at desc,m.id limit 50
    ) meetup),'[]'::jsonb),
    'online',coalesce((select jsonb_agg(to_jsonb(online_member)) from (
      select p.id,p.display_name,c.name city,q.state,q.since from (
        select user_id,city_id,'waiting'::text state,created_at since from private.match_queue where expires_at>now()
        union all
        select mp.user_id,m.city_id,case when m.status='draft' then 'accepting offer' else 'in meetup' end,m.starts_at from public.meetup_participants mp join public.meetups m on m.id=mp.meetup_id
          where mp.status='reserved' and (m.status='confirmed' and m.ends_at>now() or m.status='draft' and exists(select 1 from private.meetup_details d where d.meetup_id=m.id and d.proposal_expires_at>now()))
      ) q join public.profiles p on p.id=q.user_id join public.cities c on c.id=q.city_id
      order by q.since limit 100
    ) online_member),'[]'::jsonb),
    'audit',coalesce((select jsonb_agg(to_jsonb(entry)) from (
      select a.id,a.user_id,p.display_name,a.reason,a.after_value,a.created_at,u.email actor
      from private.admin_audit a left join public.profiles p on p.id=a.user_id left join auth.users u on u.id=a.actor_id
      order by a.created_at desc,a.id desc limit 20
    ) entry),'[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function public.admin_dashboard(text,integer),public.admin_update_entitlement(uuid,integer,text,integer,text) from public,anon,authenticated;
grant execute on function public.admin_dashboard(text,integer),public.admin_update_entitlement(uuid,integer,text,integer,text) to authenticated;
notify pgrst, 'reload schema';
commit;
