begin;

create or replace function private.queue_friend_nudge() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if private.nudge_friend_eligible(new.sender_id,new.recipient_id)
   and exists(select 1 from public.notification_preferences p where p.user_id=new.recipient_id and p.push_enabled) then
   insert into private.notification_jobs(user_id,event_key,kind,payload)
   values(new.recipient_id,'friend-nudge:'||new.sender_id::text||':'||new.id::text,'friend_push',
     jsonb_build_object('title','A friend wants to connect','text','A friend is requesting to connect on UpCatch.',
       'route','nudges','nudge_id',new.id))
   on conflict(event_key) do nothing;
 end if;
 return new;
end $$;
revoke all on function private.queue_friend_nudge() from public,anon,authenticated;

create or replace function private.capture_nudge_inbox() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.member_notifications(user_id,event_key,title,body,destination,peer_id,created_at)
 values(new.recipient_id,'friend-nudge:'||new.sender_id::text||':'||new.id::text,
   'A friend wants to connect','A friend is requesting to connect on UpCatch.',
   'nudges',new.sender_id,new.created_at)
 on conflict(user_id,event_key) do update set body=excluded.body,peer_id=excluded.peer_id;
 return new;
end $$;
revoke all on function private.capture_nudge_inbox() from public,anon,authenticated;

-- Remove names from existing inbox cards and unsent/retrying nudge jobs too.
update public.member_notifications set title='A friend wants to connect',
 body='A friend is requesting to connect on UpCatch.' where destination='nudges';
update private.notification_jobs set payload=payload||jsonb_build_object(
 'title','A friend wants to connect','text','A friend is requesting to connect on UpCatch.')
 where kind='friend_push' and payload->>'route'='nudges' and state='pending';

notify pgrst, 'reload schema';
commit;
