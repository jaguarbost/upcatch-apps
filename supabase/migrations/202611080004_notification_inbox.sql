begin;

create table public.member_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_key text not null,
  title text not null check(length(title) between 1 and 120),
  body text not null check(length(body) between 1 and 500),
  destination text not null check(destination in ('map','wall','messages','meetups','nudges')),
  chat text check(chat in ('live','scheduled')),
  post_id text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique(user_id,event_key)
);
create index member_notifications_recent on public.member_notifications(user_id,created_at desc);
alter table public.member_notifications enable row level security;
create policy member_notifications_read on public.member_notifications for select to authenticated
  using(user_id=auth.uid());
create policy member_notifications_mark_read on public.member_notifications for update to authenticated
  using(user_id=auth.uid()) with check(user_id=auth.uid());
revoke all on public.member_notifications from public,anon,authenticated;
grant select on public.member_notifications to authenticated;
grant update(read_at) on public.member_notifications to authenticated;

create function private.capture_push_inbox() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_destination text;
begin
 if new.kind not in ('welcome_push','meetup_push','friend_push') then return new; end if;
 v_destination:=case new.payload->>'route'
   when 'wall' then 'wall' when 'nudges' then 'nudges'
   when 'messages' then 'messages' when 'meetups' then 'meetups'
   else 'map' end;
 insert into public.member_notifications(user_id,event_key,title,body,destination,chat,post_id,created_at)
 values(new.user_id,new.event_key,
   left(coalesce(nullif(new.payload->>'title',''),'UpCatch update'),120),
   left(coalesce(nullif(new.payload->>'text',''),'Open UpCatch to see what is new.'),500),
   v_destination,
   case when v_destination='messages' and new.payload->>'chat' in ('live','scheduled') then new.payload->>'chat' else null end,
   case when v_destination='messages' and new.payload->>'chat'='scheduled' then new.payload->>'post_id' else null end,
   new.created_at)
 on conflict(user_id,event_key) do nothing;
 return new;
end $$;
create trigger capture_push_inbox after insert on private.notification_jobs
for each row execute function private.capture_push_inbox();
revoke all on function private.capture_push_inbox() from public,anon,authenticated;

-- Nudge requests remain in the inbox even if the recipient has push disabled.
create function private.capture_nudge_inbox() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.member_notifications(user_id,event_key,title,body,destination,created_at)
 select new.recipient_id,'friend-nudge:'||new.sender_id::text||':'||new.id::text,
   'A friend wants to connect',left(p.display_name||' is requesting to connect on UpCatch.',500),
   'nudges',new.created_at
 from public.profiles p where p.id=new.sender_id
 on conflict(user_id,event_key) do nothing;
 return new;
end $$;
create trigger capture_nudge_inbox after insert on private.friend_nudges
for each row execute function private.capture_nudge_inbox();
revoke all on function private.capture_nudge_inbox() from public,anon,authenticated;

-- Messages appear in the inbox even when the recipient has opted out of push.
create function private.capture_message_inbox() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_recipient uuid; v_chat text; v_post uuid;
begin
 if tg_table_name='meetup_messages' then
   v_chat:='live';
   select p.user_id into v_recipient from public.meetup_participants p
     join public.meetups m on m.id=p.meetup_id
     where p.meetup_id=new.meetup_id and p.user_id<>new.user_id
       and p.status='reserved' and m.status='confirmed' limit 1;
 else
   v_chat:='scheduled'; v_post:=new.post_id;
   select case when post.author_id=new.user_id then request.user_id else post.author_id end
     into v_recipient from private.scheduled_posts post
     join private.scheduled_post_requests request on request.post_id=post.id and request.status='accepted'
     where post.id=new.post_id and post.status='matched'
       and post.starts_at+make_interval(mins=>post.duration_min)>now()
       and new.user_id in(post.author_id,request.user_id) limit 1;
 end if;
 if v_recipient is not null then
   insert into public.member_notifications(user_id,event_key,title,body,destination,chat,post_id,created_at)
   values(v_recipient,'chat:'||new.user_id::text||':'||v_chat||':'||new.id::text,
     'New message','You have a new UpCatch message.','messages',v_chat,v_post::text,new.created_at)
   on conflict(user_id,event_key) do nothing;
 end if;
 return new;
end $$;
create trigger capture_meetup_message_inbox after insert on private.meetup_messages
for each row execute function private.capture_message_inbox();
create trigger capture_scheduled_message_inbox after insert on private.scheduled_post_messages
for each row execute function private.capture_message_inbox();
revoke all on function private.capture_message_inbox() from public,anon,authenticated;

-- Preserve recent notifications queued before this migration.
insert into public.member_notifications(user_id,event_key,title,body,destination,chat,post_id,created_at)
select j.user_id,j.event_key,
  left(coalesce(nullif(j.payload->>'title',''),'UpCatch update'),120),
  left(coalesce(nullif(j.payload->>'text',''),'Open UpCatch to see what is new.'),500),
  case j.payload->>'route' when 'wall' then 'wall' when 'nudges' then 'nudges'
    when 'messages' then 'messages' when 'meetups' then 'meetups' else 'map' end,
  case when j.payload->>'route'='messages' and j.payload->>'chat' in ('live','scheduled') then j.payload->>'chat' else null end,
  case when j.payload->>'route'='messages' and j.payload->>'chat'='scheduled' then j.payload->>'post_id' else null end,
  j.created_at
from private.notification_jobs j
where j.kind in ('welcome_push','meetup_push','friend_push') and j.created_at>now()-interval '30 days'
on conflict(user_id,event_key) do nothing;

insert into public.member_notifications(user_id,event_key,title,body,destination,created_at)
select n.recipient_id,'friend-nudge:'||n.sender_id::text||':'||n.id::text,
  'A friend wants to connect',left(p.display_name||' is requesting to connect on UpCatch.',500),
  'nudges',n.created_at
from private.friend_nudges n join public.profiles p on p.id=n.sender_id
where n.created_at>now()-interval '30 days'
on conflict(user_id,event_key) do nothing;

notify pgrst, 'reload schema';
commit;
