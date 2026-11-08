begin;

create table private.friend_nudges (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  dismissed_at timestamptz,
  check (sender_id <> recipient_id)
);
create unique index friend_nudges_open_pair on private.friend_nudges(sender_id,recipient_id) where dismissed_at is null;
create index friend_nudges_recipient on private.friend_nudges(recipient_id,created_at desc) where dismissed_at is null;
create index friend_nudges_sender on private.friend_nudges(sender_id,created_at desc);
create table private.friend_nudge_batches (
  id bigint generated always as identity primary key,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index friend_nudge_batches_sender on private.friend_nudge_batches(sender_id,created_at desc);
alter table private.friend_nudges enable row level security;
alter table private.friend_nudge_batches enable row level security;
revoke all on private.friend_nudges,private.friend_nudge_batches from public,anon,authenticated;
grant select,insert,update,delete on private.friend_nudges,private.friend_nudge_batches to service_role;
grant usage,select on sequence private.friend_nudge_batches_id_seq to service_role;

create function private.nudge_friend_eligible(p_sender uuid,p_recipient uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select p_sender is not null and p_recipient is not null and p_sender<>p_recipient
 and exists(select 1 from private.friendships f where f.first_id=least(p_sender,p_recipient) and f.second_id=greatest(p_sender,p_recipient))
 and exists(select 1 from public.profiles p join auth.users u on u.id=p.id join private.member_access a on a.user_id=p.id
   where p.id=p_recipient and p.onboarding_completed_at is not null and u.email_confirmed_at is not null and a.account_status='active')
 and not exists(select 1 from private.member_blocks b where
   (b.blocker_id=p_sender and b.blocked_id=p_recipient) or (b.blocker_id=p_recipient and b.blocked_id=p_sender));
$$;
revoke all on function private.nudge_friend_eligible(uuid,uuid) from public,anon,authenticated;

create function public.nudge_friends(p_recipient uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); v_count integer:=0; v_friend uuid;
begin
 if not private.is_confirmed() or not exists(select 1 from public.profiles p join private.member_access a on a.user_id=p.id
   where p.id=me and p.onboarding_completed_at is not null and a.account_status='active') then
   raise exception 'Complete your confirmed account first'; end if;
 perform pg_advisory_xact_lock(hashtextextended(me::text,73));
 if p_recipient is not null then
   if p_recipient=me then raise exception 'You cannot nudge yourself'; end if;
   if not private.nudge_friend_eligible(me,p_recipient) then raise exception 'This person is no longer your friend'; end if;
   if exists(select 1 from private.friend_nudges n where n.sender_id=me and n.recipient_id=p_recipient and n.dismissed_at is null) then
     raise exception 'Your nudge is already waiting for this friend'; end if;
   if exists(select 1 from private.friend_nudges n where n.sender_id=me and n.recipient_id=p_recipient and n.created_at>now()-interval '30 minutes') then
     raise exception 'Wait 30 minutes before nudging this friend again'; end if;
   insert into private.friend_nudges(sender_id,recipient_id) values(me,p_recipient);
   v_count:=1;
 else
   if exists(select 1 from private.friend_nudge_batches b where b.sender_id=me and b.created_at>now()-interval '6 hours') then
     raise exception 'Wait 6 hours before nudging all friends again'; end if;
   if not exists(select 1 from private.friendships f where me in(f.first_id,f.second_id)) then
     raise exception 'Add a friend before sending a nudge'; end if;
   insert into private.friend_nudge_batches(sender_id) values(me);
   for v_friend in select case when f.first_id=me then f.second_id else f.first_id end
     from private.friendships f where me in(f.first_id,f.second_id)
   loop
     if private.nudge_friend_eligible(me,v_friend)
       and not exists(select 1 from private.friend_nudges n where n.sender_id=me and n.recipient_id=v_friend
         and (n.dismissed_at is null or n.created_at>now()-interval '30 minutes')) then
       insert into private.friend_nudges(sender_id,recipient_id) values(me,v_friend);
       v_count:=v_count+1;
     end if;
   end loop;
 end if;
 return jsonb_build_object('sent',v_count);
end $$;
revoke all on function public.nudge_friends(uuid) from public,anon,authenticated;
grant execute on function public.nudge_friends(uuid) to authenticated;

create function public.my_friend_nudges() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=auth.uid(); result jsonb;
begin
 if not private.is_confirmed() or not exists(select 1 from public.profiles where id=me and onboarding_completed_at is not null) then
   raise exception 'Complete your confirmed account first'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'sender_id',n.sender_id,'sender_name',p.display_name,'created_at',n.created_at)
   order by n.created_at desc),'[]'::jsonb) into result
 from private.friend_nudges n join public.profiles p on p.id=n.sender_id
 where n.recipient_id=me and n.dismissed_at is null and private.nudge_friend_eligible(n.sender_id,me);
 return result;
end $$;
revoke all on function public.my_friend_nudges() from public,anon,authenticated;
grant execute on function public.my_friend_nudges() to authenticated;

create function public.dismiss_friend_nudge(p_nudge uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); changed integer;
begin
 if not private.is_confirmed() then raise exception 'Confirmed account required'; end if;
 update private.friend_nudges set dismissed_at=now() where id=p_nudge and recipient_id=me and dismissed_at is null;
 get diagnostics changed=row_count;
 return changed=1;
end $$;
revoke all on function public.dismiss_friend_nudge(uuid) from public,anon,authenticated;
grant execute on function public.dismiss_friend_nudge(uuid) to authenticated;

create function private.queue_friend_nudge() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if private.nudge_friend_eligible(new.sender_id,new.recipient_id)
   and exists(select 1 from public.notification_preferences p where p.user_id=new.recipient_id and p.push_enabled) then
   insert into private.notification_jobs(user_id,event_key,kind,payload)
   select new.recipient_id,'friend-nudge:'||new.sender_id::text||':'||new.id::text,'friend_push',
     jsonb_build_object('title','A friend wants to connect','text',p.display_name||' is requesting to connect on UpCatch.',
       'route','nudges','nudge_id',new.id)
   from public.profiles p where p.id=new.sender_id on conflict(event_key) do nothing;
 end if;
 return new;
end $$;
create trigger queue_friend_nudge after insert on private.friend_nudges for each row execute function private.queue_friend_nudge();
revoke all on function private.queue_friend_nudge() from public,anon,authenticated;

create function public.friend_nudge_push_active(p_nudge uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.friend_nudges n where n.id=p_nudge and n.dismissed_at is null
   and private.nudge_friend_eligible(n.sender_id,n.recipient_id));
$$;
revoke all on function public.friend_nudge_push_active(uuid) from public,anon,authenticated;
grant execute on function public.friend_nudge_push_active(uuid) to service_role;

create or replace function public.notification_recipients(p_user uuid) returns table(user_id uuid)
language sql stable security definer set search_path='' as $$
 with latest as (
  select m.id from public.meetups m join public.meetup_participants p on p.meetup_id=m.id
  where p.user_id=p_user order by m.created_at desc,m.id desc limit 1
 )
 select p_user where p_user is not null
 union select p.user_id from public.meetup_participants p join latest m on m.id=p.meetup_id
 union select j.user_id from private.notification_jobs j
 where j.kind='friend_push' and j.state='pending' and j.event_key like 'friend-online:'||p_user::text||':%'
 union select j.user_id from private.notification_jobs j join private.scheduled_posts post
   on j.event_key like 'scheduled-nearby:'||post.id::text||':%'
 where post.author_id=p_user and j.state='pending' and post.status='open' and post.starts_at>now()
 union select j.user_id from private.notification_jobs j
 where j.kind='friend_push' and j.state='pending' and j.event_key like 'friend-nudge:'||p_user::text||':%';
$$;
revoke all on function public.notification_recipients(uuid) from public,anon,authenticated;
grant execute on function public.notification_recipients(uuid) to service_role;
notify pgrst, 'reload schema';
commit;
