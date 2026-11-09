begin;

create table private.friend_messages (
 id bigint generated always as identity primary key,
 sender_id uuid not null references public.profiles(id) on delete cascade,
 recipient_id uuid not null references public.profiles(id) on delete cascade,
 body text not null check(char_length(btrim(body)) between 1 and 80),
 created_at timestamptz not null default now(),
 check(sender_id<>recipient_id)
);
create index friend_messages_pair_recent on private.friend_messages(sender_id,recipient_id,id desc);
alter table private.friend_messages enable row level security;
revoke all on private.friend_messages from public,anon,authenticated;
grant all on private.friend_messages to service_role;
grant usage,select on sequence private.friend_messages_id_seq to service_role;
create trigger friend_message_phone_guard before insert or update of body on private.friend_messages
for each row execute function private.reject_phone_in_message();

create function public.list_friend_messages(p_friend uuid)
returns table(id bigint,body text,sender_is_me boolean,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_confirmed() or not exists(select 1 from private.member_access a where a.user_id=auth.uid() and a.account_status='active')
   then raise exception 'Active account required'; end if;
 if not private.nudge_friend_eligible(auth.uid(),p_friend) then raise exception 'This person is no longer your friend'; end if;
 return query select msg.id,msg.body,msg.sender_id=auth.uid(),msg.created_at
 from (select m.id,m.body,m.sender_id,m.created_at from private.friend_messages m
   where (m.sender_id=auth.uid() and m.recipient_id=p_friend)
      or (m.sender_id=p_friend and m.recipient_id=auth.uid())
   order by m.id desc limit 100) msg order by msg.id;
end $$;

create function public.send_friend_message(p_friend uuid,p_text text) returns void
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid();
begin
 if not private.is_confirmed() or not exists(select 1 from private.member_access a where a.user_id=me and a.account_status='active')
   then raise exception 'Active account required'; end if;
 if p_text is null or char_length(btrim(p_text)) not between 1 and 80 then raise exception 'Use 1 to 80 characters'; end if;
 perform pg_advisory_xact_lock(hashtextextended('message:'||me::text,0));
 if not private.nudge_friend_eligible(me,p_friend) then raise exception 'This person is no longer your friend'; end if;
 if private.message_contains_phone(p_text) then raise exception 'Keep phone numbers out of UpCatch messages'; end if;
 if (select count(*) from private.friend_messages where sender_id=me and created_at>now()-interval '1 minute')>=10
   then raise exception 'Please wait before sending more messages'; end if;
 insert into private.friend_messages(sender_id,recipient_id,body) values(me,p_friend,btrim(p_text));
end $$;
revoke all on function public.list_friend_messages(uuid),public.send_friend_message(uuid,text) from public,anon;
grant execute on function public.list_friend_messages(uuid),public.send_friend_message(uuid,text) to authenticated;

create function private.queue_friend_message_push() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.notification_preferences p where p.user_id=new.recipient_id and p.push_enabled) then
   insert into private.notification_jobs(user_id,event_key,kind,payload)
   values(new.recipient_id,'chat:'||new.sender_id::text||':friend:'||new.id::text,'friend_push',
     jsonb_build_object('title','New message','text','A friend sent you a message on UpCatch.',
       'route','messages','chat','friend','peer_id',new.sender_id,'message_id',new.id))
   on conflict(event_key) do nothing;
 end if;
 return new;
end $$;
create trigger friend_message_push after insert on private.friend_messages
for each row execute function private.queue_friend_message_push();
revoke all on function private.queue_friend_message_push() from public,anon,authenticated;

create or replace function public.chat_message_push_active(p_chat text,p_message bigint,p_recipient uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select case when p_chat='live' then exists(
   select 1 from private.meetup_messages msg
   join public.meetups m on m.id=msg.meetup_id and m.status='confirmed'
   join public.meetup_participants sender on sender.meetup_id=m.id and sender.user_id=msg.user_id and sender.status='reserved'
   join public.meetup_participants recipient on recipient.meetup_id=m.id and recipient.user_id=p_recipient and recipient.status='reserved'
   where msg.id=p_message and msg.user_id<>p_recipient
 ) when p_chat='scheduled' then exists(
   select 1 from private.scheduled_post_messages msg
   join private.scheduled_posts post on post.id=msg.post_id and post.status='matched'
   join private.scheduled_post_requests request on request.post_id=post.id and request.status='accepted'
   where msg.id=p_message and post.starts_at+make_interval(mins=>post.duration_min)>now()
     and ((msg.user_id=post.author_id and p_recipient=request.user_id)
       or (msg.user_id=request.user_id and p_recipient=post.author_id))
 ) when p_chat='friend' then exists(
   select 1 from private.friend_messages msg where msg.id=p_message and msg.recipient_id=p_recipient
     and private.nudge_friend_eligible(msg.sender_id,msg.recipient_id)
     and exists(select 1 from private.member_access a where a.user_id=msg.sender_id and a.account_status='active')
 ) else false end;
$$;
revoke all on function public.chat_message_push_active(text,bigint,uuid) from public,anon,authenticated;
grant execute on function public.chat_message_push_active(text,bigint,uuid) to service_role;

alter table public.member_notifications add column peer_id uuid references public.profiles(id) on delete set null;
alter table public.member_notifications drop constraint if exists member_notifications_chat_check;
alter table public.member_notifications add constraint member_notifications_chat_check check(chat in ('live','scheduled','friend'));
update public.member_notifications n set peer_id=sender.id from public.profiles sender
where n.event_key like 'friend-nudge:'||sender.id::text||':%';

create or replace function private.capture_nudge_inbox() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.member_notifications(user_id,event_key,title,body,destination,peer_id,created_at)
 select new.recipient_id,'friend-nudge:'||new.sender_id::text||':'||new.id::text,
   'A friend wants to connect',left(p.display_name||' is requesting to connect on UpCatch.',500),
   'nudges',new.sender_id,new.created_at
 from public.profiles p where p.id=new.sender_id
 on conflict(user_id,event_key) do update set peer_id=excluded.peer_id;
 return new;
end $$;

create or replace function private.capture_push_inbox() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_destination text;
begin
 if new.kind not in ('welcome_push','meetup_push','friend_push') then return new; end if;
 v_destination:=case new.payload->>'route'
   when 'wall' then 'wall' when 'nudges' then 'nudges'
   when 'messages' then 'messages' when 'meetups' then 'meetups'
   else 'map' end;
 insert into public.member_notifications(user_id,event_key,title,body,destination,chat,post_id,peer_id,created_at)
 values(new.user_id,new.event_key,
   left(coalesce(nullif(new.payload->>'title',''),'UpCatch update'),120),
   left(coalesce(nullif(new.payload->>'text',''),'Open UpCatch to see what is new.'),500),
   v_destination,
   case when v_destination='messages' and new.payload->>'chat' in ('live','scheduled','friend') then new.payload->>'chat' else null end,
   case when v_destination='messages' and new.payload->>'chat'='scheduled' then new.payload->>'post_id' else null end,
   case when new.payload->>'peer_id' ~ '^[0-9a-f-]{36}$' then (new.payload->>'peer_id')::uuid else null end,
   new.created_at)
 on conflict(user_id,event_key) do update set peer_id=coalesce(public.member_notifications.peer_id,excluded.peer_id);
 return new;
end $$;

create function private.capture_friend_message_inbox() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.member_notifications(user_id,event_key,title,body,destination,chat,peer_id,created_at)
 values(new.recipient_id,'chat:'||new.sender_id::text||':friend:'||new.id::text,
   'New message','A friend sent you a message on UpCatch.','messages','friend',new.sender_id,new.created_at)
 on conflict(user_id,event_key) do nothing;
 return new;
end $$;
create trigger capture_friend_message_inbox after insert on private.friend_messages
for each row execute function private.capture_friend_message_inbox();
revoke all on function private.capture_friend_message_inbox() from public,anon,authenticated;

notify pgrst, 'reload schema';
commit;
