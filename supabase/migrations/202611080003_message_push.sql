begin;

-- A message is persisted first; push is an optional alert to the other participant.
create function private.queue_chat_message_push() returns trigger
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
 if v_recipient is not null and exists(select 1 from public.notification_preferences p
   where p.user_id=v_recipient and p.push_enabled) then
   insert into private.notification_jobs(user_id,event_key,kind,payload)
   values(v_recipient,'chat:'||new.user_id::text||':'||v_chat||':'||new.id::text,'friend_push',
     jsonb_build_object('title','New message','text','You have a new UpCatch message.',
       'route','messages','chat',v_chat,'post_id',v_post,'message_id',new.id))
   on conflict(event_key) do nothing;
 end if;
 return new;
end $$;
create trigger meetup_message_push after insert on private.meetup_messages
for each row execute function private.queue_chat_message_push();
create trigger scheduled_message_push after insert on private.scheduled_post_messages
for each row execute function private.queue_chat_message_push();
revoke all on function private.queue_chat_message_push() from public,anon,authenticated;

create function public.chat_message_push_active(p_chat text,p_message bigint,p_recipient uuid) returns boolean
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
 ) else false end;
$$;
revoke all on function public.chat_message_push_active(text,bigint,uuid) from public,anon,authenticated;
grant execute on function public.chat_message_push_active(text,bigint,uuid) to service_role;

create or replace function public.notification_recipients(p_user uuid) returns table(user_id uuid)
language sql stable security definer set search_path='' as $$
 with latest as (
  select m.id from public.meetups m join public.meetup_participants p on p.meetup_id=m.id
  where p.user_id=p_user order by m.created_at desc,m.id desc limit 1
 )
 select p_user where p_user is not null
 union select p.user_id from public.meetup_participants p join latest m on m.id=p.meetup_id
 union select j.user_id from private.notification_jobs j
 where j.kind='friend_push' and j.state='pending' and (
   j.event_key like 'friend-online:'||p_user::text||':%'
   or j.event_key like 'friend-nudge:'||p_user::text||':%'
   or j.event_key like 'chat:'||p_user::text||':%')
 union select j.user_id from private.notification_jobs j join private.scheduled_posts post
   on j.event_key like 'scheduled-nearby:'||post.id::text||':%'
 where post.author_id=p_user and j.state='pending' and post.status='open' and post.starts_at>now();
$$;
revoke all on function public.notification_recipients(uuid) from public,anon,authenticated;
grant execute on function public.notification_recipients(uuid) to service_role;
notify pgrst, 'reload schema';
commit;
