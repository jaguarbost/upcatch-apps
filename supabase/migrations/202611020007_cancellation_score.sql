-- Member-initiated cancellations after pairing affect the show-up score.
begin;
create table private.member_cancellation_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_key text not null unique,
  created_at timestamptz not null default now()
);
create index member_cancellation_events_user_idx on private.member_cancellation_events(user_id,created_at);
alter table private.member_cancellation_events enable row level security;
revoke all on private.member_cancellation_events from public,anon,authenticated;
grant all on private.member_cancellation_events to service_role;

create function public.cancel_current_meetup() returns void
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_meetup uuid;
begin
  if not private.is_confirmed() then raise exception 'Sign in first'; end if;
  select m.id into v_meetup from public.meetups m
    join public.meetup_participants p on p.meetup_id=m.id
    where p.user_id=v_user and p.status='reserved' and m.status='confirmed'
    limit 1;
  if v_meetup is null then raise exception 'No confirmed meetup to cancel'; end if;
  perform public.meetup_command('cancel');
  insert into private.member_cancellation_events(user_id,event_key)
    values(v_user,'live:'||v_meetup) on conflict(event_key) do nothing;
end $$;
revoke all on function public.cancel_current_meetup() from public,anon;
grant execute on function public.cancel_current_meetup() to authenticated;

create or replace function public.cancel_scheduled_plan(p_post uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();
begin
  if not private.is_confirmed() then raise exception 'Confirm your email first'; end if;
  update private.scheduled_posts p set status='cancelled'
  where p.id=p_post and p.status='matched' and (
    p.author_id=v_user or exists(select 1 from private.scheduled_post_requests r
      where r.post_id=p.id and r.user_id=v_user and r.status='accepted'));
  if not found then raise exception 'Your accepted invite was not found'; end if;
  update private.scheduled_post_requests set status='cancelled'
    where post_id=p_post and status='accepted';
  insert into private.member_cancellation_events(user_id,event_key)
    values(v_user,'scheduled:'||p_post) on conflict(event_key) do nothing;
end $$;
revoke all on function public.cancel_scheduled_plan(uuid) from public,anon;
grant execute on function public.cancel_scheduled_plan(uuid) to authenticated;

create or replace function private.show_up_percent(p_user uuid) returns integer
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
 ), cancellations as (
  select count(*)::integer n from private.member_cancellation_events where user_id=p_user
 )
 select case
  when coalesce((select completed_meetups from private.member_access where user_id=p_user),0)=0
    and reports.n<3 and cancellations.n=0 then null
  else greatest(75,100-5*greatest(reports.n-2,0)-5*cancellations.n)
 end
 from reports,cancellations;
$$;
revoke all on function private.show_up_percent(uuid) from public,anon,authenticated;
notify pgrst, 'reload schema';
commit;
