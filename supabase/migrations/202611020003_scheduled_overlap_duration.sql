-- Include the possible meetup duration after a Go Live search closes.
begin;
create or replace function private.guard_scheduled_meeting_overlap() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_member uuid;
begin
  if new.status<>'matched' or old.status=new.status then return new; end if;
  for v_member in
    select new.author_id union select user_id from private.scheduled_post_requests
    where post_id=new.id and status='accepted'
  loop
    if exists(
      select 1 from private.scheduled_posts other
      left join private.scheduled_post_requests joined on joined.post_id=other.id and joined.status='accepted'
      where other.id<>new.id and other.status='matched'
        and (other.author_id=v_member or joined.user_id=v_member)
        and new.starts_at < other.starts_at + make_interval(mins=>other.duration_min)
        and other.starts_at < new.starts_at + make_interval(mins=>new.duration_min)
    ) then raise exception 'This member already has a scheduled meetup at that time'; end if;
    if exists(
      select 1 from private.match_queue q where q.user_id=v_member
        and q.expires_at + make_interval(mins=>q.duration_min)>new.starts_at - interval '15 minutes'
        and now()<new.starts_at + make_interval(mins=>new.duration_min)
    ) then raise exception 'This member is already available during that time'; end if;
    if exists(
      select 1 from public.meetups m join public.meetup_participants mp on mp.meetup_id=m.id
      where mp.user_id=v_member and mp.status='reserved' and m.status in ('draft','confirmed')
        and m.starts_at < new.starts_at + make_interval(mins=>new.duration_min)
        and m.ends_at > new.starts_at - interval '15 minutes'
    ) then raise exception 'This member already has a meetup at that time'; end if;
  end loop;
  return new;
end $$;

create or replace function private.guard_live_scheduled_overlap() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(
    select 1 from private.scheduled_posts p
    left join private.scheduled_post_requests r on r.post_id=p.id and r.status='accepted'
    where p.status='matched' and (p.author_id=new.user_id or r.user_id=new.user_id)
      and p.starts_at < greatest(new.expires_at,now()) + make_interval(mins=>new.duration_min)
      and p.starts_at + make_interval(mins=>p.duration_min)>now()
  ) then raise exception 'Your scheduled meetup overlaps this Go Live window'; end if;
  return new;
end $$;
revoke all on function private.guard_scheduled_meeting_overlap(),private.guard_live_scheduled_overlap() from public,anon,authenticated;
notify pgrst, 'reload schema';
commit;
